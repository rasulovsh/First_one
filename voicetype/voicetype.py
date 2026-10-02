"""VoiceType — плавающий виджет голосового ввода (русский / English / o'zbek).

Виджет всегда поверх окон и полупрозрачный. Ставите курсор в любое поле ввода,
жмёте горячую клавишу (по умолчанию F9) или кнопку микрофона и говорите —
каждая фраза распознаётся после паузы и вставляется туда, где стоит курсор.
"""

import collections
import io
import json
import logging
import os
import queue
import subprocess
import sys
import threading
import time
import wave

import numpy as np

APP_NAME = "VoiceType"
APP_DIR = os.path.dirname(os.path.abspath(__file__))
SCRIPT_PATH = os.path.abspath(__file__)
CONFIG_PATH = os.path.join(APP_DIR, "config.json")
LOG_PATH = os.path.join(APP_DIR, "voicetype.log")
IS_WIN = sys.platform == "win32"
IS_MAC = sys.platform == "darwin"
SAMPLE_RATE = 16000
CHUNK_SECONDS = 0.1

DEFAULT_CONFIG = {
    # local  — бесплатно, офлайн, без ключей (модель скачается один раз)
    # groq   — облако, очень быстро, бесплатный ключ на console.groq.com
    # openai — облако, лучшее качество, платный ключ platform.openai.com
    "engine": "local",
    "api_key": "",
    "api_model": "",
    "local_model": "large-v3-turbo",
    "device": "auto",
    "language": "auto",
    "auto_languages": ["ru", "en", "uz"],
    "hotkey": "<f9>",
    "hotkey_mode": "toggle",
    "opacity": 0.85,
    "silence_seconds": 0.9,
    "max_segment_seconds": 25,
    "min_volume": 0.006,
    "autostart": True,
    "position": None,
}

LANGS = ["auto", "ru", "en", "uz"]

# Короткие подсказки задают модели стиль: пунктуацию и латиницу для узбекского.
PROMPTS = {
    "ru": "Привет. Сегодня обсудим проект, сроки и детали.",
    "en": "Hello. Today we will discuss the project, deadlines and details.",
    "uz": "Assalomu alaykum. Bugun loyiha, muddatlar va tafsilotlarni muhokama qilamiz.",
}

# Типичные «галлюцинации» Whisper на тишине и шуме.
HALLUCINATIONS = (
    "продолжение следует",
    "субтитры",
    "спасибо за просмотр",
    "подписывайтесь на канал",
    "dimatorzok",
    "thanks for watching",
    "thank you for watching",
    "subtitles by",
)

logging.basicConfig(
    filename=LOG_PATH,
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    encoding="utf-8",
)
log = logging.getLogger(APP_NAME)


# ---------------------------------------------------------------- config

def load_config():
    cfg = dict(DEFAULT_CONFIG)
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, encoding="utf-8") as f:
                cfg.update(json.load(f))
        except Exception:
            log.exception("config.json не читается, беру настройки по умолчанию")
    else:
        save_config(cfg)
    return cfg


def save_config(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------- autostart

def _pythonw():
    exe = sys.executable
    if IS_WIN:
        candidate = os.path.join(os.path.dirname(exe), "pythonw.exe")
        if os.path.exists(candidate):
            return candidate
    return exe


def set_autostart(enabled):
    try:
        if IS_WIN:
            import winreg
            key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Run",
                0,
                winreg.KEY_SET_VALUE,
            )
            if enabled:
                cmd = f'"{_pythonw()}" "{SCRIPT_PATH}"'
                winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ, cmd)
            else:
                try:
                    winreg.DeleteValue(key, APP_NAME)
                except FileNotFoundError:
                    pass
            winreg.CloseKey(key)
        elif IS_MAC:
            path = os.path.expanduser("~/Library/LaunchAgents/com.voicetype.app.plist")
            if enabled:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8") as f:
                    f.write(
                        '<?xml version="1.0" encoding="UTF-8"?>\n'
                        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" '
                        '"http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
                        '<plist version="1.0"><dict>\n'
                        "<key>Label</key><string>com.voicetype.app</string>\n"
                        "<key>ProgramArguments</key><array>\n"
                        f"<string>{sys.executable}</string><string>{SCRIPT_PATH}</string>\n"
                        "</array>\n<key>RunAtLoad</key><true/>\n</dict></plist>\n"
                    )
            elif os.path.exists(path):
                os.remove(path)
        else:
            path = os.path.expanduser("~/.config/autostart/voicetype.desktop")
            if enabled:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8") as f:
                    f.write(
                        "[Desktop Entry]\nType=Application\nName=VoiceType\n"
                        f'Exec="{sys.executable}" "{SCRIPT_PATH}"\n'
                    )
            elif os.path.exists(path):
                os.remove(path)
    except Exception:
        log.exception("не удалось изменить автозагрузку")


# ---------------------------------------------------------------- audio

class Segmenter:
    """Режет поток с микрофона на фразы по паузам."""

    def __init__(self, silence_s, max_s, min_volume, preroll_s=0.3, min_speech_s=0.25):
        self.silence_s = silence_s
        self.max_s = max_s
        self.min_volume = min_volume
        self.min_speech_s = min_speech_s
        self.preroll = collections.deque(maxlen=max(1, int(preroll_s / CHUNK_SECONDS)))
        self.noise = min_volume / 2
        self.level = 0.0
        self.reset()

    def reset(self):
        self.buf = []
        self.preroll.clear()
        self.in_speech = False
        self.silence = 0.0
        self.speech = 0.0
        self.total = 0.0

    def feed(self, chunk):
        """Принимает кусок аудио, возвращает готовую фразу или None."""
        rms = float(np.sqrt(np.mean(chunk ** 2))) if len(chunk) else 0.0
        self.level = rms
        dur = len(chunk) / SAMPLE_RATE
        voice = rms > max(self.min_volume, self.noise * 3.0)
        if not voice:
            self.noise = 0.95 * self.noise + 0.05 * rms

        if not self.in_speech:
            if voice:
                self.in_speech = True
                self.buf = list(self.preroll) + [chunk]
                self.total = sum(len(c) for c in self.buf) / SAMPLE_RATE
                self.speech = dur
                self.silence = 0.0
            else:
                self.preroll.append(chunk)
            return None

        self.buf.append(chunk)
        self.total += dur
        if voice:
            self.speech += dur
            self.silence = 0.0
        else:
            self.silence += dur
        if self.silence >= self.silence_s or self.total >= self.max_s:
            return self._emit()
        return None

    def flush(self):
        return self._emit() if self.in_speech else None

    def _emit(self):
        audio = np.concatenate(self.buf) if self.buf else None
        enough = self.speech >= self.min_speech_s
        self.reset()
        return audio if enough else None


class Recorder:
    def __init__(self, cfg, on_segment):
        self.cfg = cfg
        self.on_segment = on_segment
        self.stream = None
        self.segmenter = None
        self.session = 0

    @property
    def level(self):
        return self.segmenter.level if self.segmenter else 0.0

    def start(self):
        import sounddevice as sd
        self.session += 1
        self.segmenter = Segmenter(
            self.cfg["silence_seconds"],
            self.cfg["max_segment_seconds"],
            self.cfg["min_volume"],
        )
        self.stream = sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="float32",
            blocksize=int(SAMPLE_RATE * CHUNK_SECONDS),
            callback=self._callback,
        )
        self.stream.start()

    def _callback(self, indata, frames, t, status):
        seg = self.segmenter.feed(indata[:, 0].copy())
        if seg is not None:
            self.on_segment(seg, self.session)

    def stop(self):
        if self.stream is not None:
            self.stream.stop()
            self.stream.close()
            self.stream = None
        if self.segmenter is not None:
            seg = self.segmenter.flush()
            if seg is not None:
                self.on_segment(seg, self.session)
            self.segmenter.level = 0.0


# ---------------------------------------------------------------- engines

class LocalEngine:
    """faster-whisper на вашем компьютере. Без интернета и без ключей."""

    def __init__(self, cfg):
        self.cfg = cfg
        self.model = None
        self.downloading = False

    def load(self):
        from faster_whisper import WhisperModel
        device = self.cfg["device"]
        if device == "auto":
            try:
                import ctranslate2
                device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
            except Exception:
                device = "cpu"
        compute = "float16" if device == "cuda" else "int8"
        log.info("загружаю модель %s на %s (%s)", self.cfg["local_model"], device, compute)
        opts = dict(device=device, compute_type=compute,
                    download_root=os.path.join(APP_DIR, "models"))
        try:
            # Уже скачанная модель открывается с диска, интернет не нужен.
            self.model = WhisperModel(self.cfg["local_model"], local_files_only=True, **opts)
        except Exception:
            log.info("модели нет на диске, скачиваю (один раз)")
            self.downloading = True
            try:
                self.model = WhisperModel(self.cfg["local_model"], **opts)
            finally:
                self.downloading = False

    def transcribe(self, audio, lang):
        opts = dict(beam_size=5, vad_filter=True, condition_on_previous_text=False)
        segments, info = self.model.transcribe(
            audio, language=lang, initial_prompt=PROMPTS.get(lang), **opts
        )
        allowed = self.cfg.get("auto_languages") or []
        if lang is None and allowed and info.language not in allowed:
            # Whisper иногда принимает узбекский за турецкий/казахский —
            # выбираем самый вероятный из разрешённых языков.
            probs = dict(info.all_language_probs or [])
            best = max(allowed, key=lambda code: probs.get(code, 0.0))
            log.info("язык %s вне списка, переключаю на %s", info.language, best)
            segments, info = self.model.transcribe(
                audio, language=best, initial_prompt=PROMPTS.get(best), **opts
            )
        return " ".join(s.text.strip() for s in segments).strip()


class CloudEngine:
    """Groq или OpenAI: быстрее и точнее, но нужен ключ и интернет."""

    ENDPOINTS = {
        "groq": ("https://api.groq.com/openai/v1/audio/transcriptions", "whisper-large-v3"),
        "openai": ("https://api.openai.com/v1/audio/transcriptions", "gpt-4o-transcribe"),
    }
    ENV_KEYS = {"groq": "GROQ_API_KEY", "openai": "OPENAI_API_KEY"}

    def __init__(self, cfg):
        self.cfg = cfg
        self.url, default_model = self.ENDPOINTS[cfg["engine"]]
        self.model = cfg.get("api_model") or default_model
        self.key = cfg.get("api_key") or os.environ.get(self.ENV_KEYS[cfg["engine"]], "")

    def load(self):
        if not self.key:
            raise RuntimeError("нет api_key в config.json")

    def transcribe(self, audio, lang):
        import requests
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SAMPLE_RATE)
            w.writeframes((np.clip(audio, -1, 1) * 32767).astype(np.int16).tobytes())
        data = {"model": self.model, "response_format": "json"}
        if lang:
            data["language"] = lang
            data["prompt"] = PROMPTS[lang]
        r = requests.post(
            self.url,
            headers={"Authorization": f"Bearer {self.key}"},
            files={"file": ("speech.wav", buf.getvalue(), "audio/wav")},
            data=data,
            timeout=60,
        )
        r.raise_for_status()
        return r.json().get("text", "").strip()


def make_engine(cfg):
    if cfg["engine"] in CloudEngine.ENDPOINTS:
        return CloudEngine(cfg)
    return LocalEngine(cfg)


def clean_text(text):
    text = " ".join(text.split())
    low = text.lower()
    if len(text) < 80 and any(h in low for h in HALLUCINATIONS):
        return ""
    if text in PROMPTS.values():
        return ""
    return text


# ---------------------------------------------------------------- output

class Typer:
    """Вставляет текст в активное поле через буфер обмена (надёжно для кириллицы)."""

    def __init__(self):
        from pynput.keyboard import Controller
        self.kb = Controller()

    def paste(self, text):
        import pyperclip
        from pynput.keyboard import Key
        try:
            old = pyperclip.paste()
        except Exception:
            old = None
        pyperclip.copy(text)
        time.sleep(0.05)
        mod = Key.cmd if IS_MAC else Key.ctrl
        with self.kb.pressed(mod):
            self.kb.press("v")
            self.kb.release("v")
        time.sleep(0.3)
        if old is not None:
            try:
                pyperclip.copy(old)
            except Exception:
                pass


# ---------------------------------------------------------------- hotkey

class HotkeyListener:
    def __init__(self, combo, on_down, on_up):
        from pynput import keyboard
        self.keys = set(keyboard.HotKey.parse(combo))
        self.on_down = on_down
        self.on_up = on_up
        self.pressed = set()
        self.active = False
        self.listener = keyboard.Listener(on_press=self._press, on_release=self._release)
        self.listener.daemon = True

    def start(self):
        self.listener.start()

    def _variants(self, key):
        return {key, self.listener.canonical(key)}

    def _press(self, key):
        self.pressed |= self._variants(key)
        if not self.active and self.keys <= self.pressed:
            self.active = True
            self.on_down()

    def _release(self, key):
        variants = self._variants(key)
        self.pressed -= variants
        if self.active and variants & self.keys:
            self.active = False
            self.on_up()


def hotkey_label(combo):
    return "+".join(p.strip("<>").upper() for p in combo.split("+"))


# ---------------------------------------------------------------- app

COLORS = {
    "bg": "#1d1f25",
    "border": "#2f323b",
    "text": "#e8e9ed",
    "muted": "#8b8f9a",
    "idle": "#3b3f4a",
    "rec": "#e5484d",
    "busy": "#f5a524",
    "off": "#272930",
    "on": "#3dd68c",
    "loading": "#5b6170",
}


class App:
    W, H = 250, 46

    def __init__(self):
        import tkinter as tk
        self.tk = tk
        self.cfg = load_config()
        self.events = queue.Queue()
        self.jobs = queue.Queue()
        self.enabled = True
        self.recording = False
        self.ready = False
        self.pending = 0
        self.error = None
        self.error_until = 0.0
        self.last_session_pasted = None

        if self.cfg.get("autostart"):
            set_autostart(True)

        self.engine = make_engine(self.cfg)
        self.recorder = Recorder(self.cfg, lambda seg, s: self.jobs.put((seg, s)))
        self.typer = Typer()

        self._build_window()
        threading.Thread(target=self._worker, daemon=True).start()

        self.hotkey = HotkeyListener(
            self.cfg["hotkey"],
            lambda: self.events.put("hotkey_down"),
            lambda: self.events.put("hotkey_up"),
        )
        self.hotkey.start()
        self.root.after(50, self._tick)
        self.root.after(3000, self._keep_on_top)

    # ------------------------------------------------------------ window

    def _build_window(self):
        tk = self.tk
        if IS_WIN:
            try:
                import ctypes
                ctypes.windll.shcore.SetProcessDpiAwareness(1)
            except Exception:
                pass
        root = self.root = tk.Tk()
        root.title(APP_NAME)
        root.overrideredirect(True)
        root.attributes("-topmost", True)
        root.attributes("-alpha", float(self.cfg["opacity"]))
        key = "#ff00fe"
        bg = COLORS["bg"]
        if IS_WIN:
            root.config(bg=key)
            root.attributes("-transparentcolor", key)
            bg = key

        pos = self.cfg.get("position")
        if not pos:
            sw = root.winfo_screenwidth()
            sh = root.winfo_screenheight()
            pos = [sw - self.W - 40, sh - self.H - 90]
        root.geometry(f"{self.W}x{self.H}+{int(pos[0])}+{int(pos[1])}")

        c = self.canvas = tk.Canvas(root, width=self.W, height=self.H, bg=bg, highlightthickness=0)
        c.pack()
        self._rounded(1, 1, self.W - 1, self.H - 1, 22, fill=COLORS["bg"], outline=COLORS["border"])

        font = "Segoe UI" if IS_WIN else ("Helvetica Neue" if IS_MAC else "DejaVu Sans")
        cx, cy = 24, self.H // 2
        self.mic_center = (cx, cy)
        self.mic = c.create_oval(cx - 15, cy - 15, cx + 15, cy + 15, fill=COLORS["idle"], outline="", tags="mic")
        # Иконка микрофона
        c.create_oval(cx - 4, cy - 9, cx + 4, cy + 3, fill="white", outline="", tags="mic")
        c.create_rectangle(cx - 4, cy - 5, cx + 4, cy - 1, fill="white", outline="", tags="mic")
        c.create_arc(cx - 7, cy - 6, cx + 7, cy + 6, start=180, extent=180, style="arc",
                     outline="white", width=2, tags="mic")
        c.create_line(cx, cy + 6, cx, cy + 10, fill="white", width=2, tags="mic")

        self.lang_text = c.create_text(66, cy, text="", fill=COLORS["text"],
                                       font=(font, 10, "bold"), tags="lang")
        self.status_text = c.create_text(94, cy, text="", fill=COLORS["muted"],
                                         font=(font, 9), anchor="w", tags="status")
        px = self.W - 22
        self.power_bg = c.create_oval(px - 11, cy - 11, px + 11, cy + 11, fill=COLORS["bg"],
                                      outline="", tags="power")
        self.power_arc = c.create_arc(px - 6, cy - 6, px + 6, cy + 6, start=120, extent=300,
                                      style="arc", outline=COLORS["on"], width=2, tags="power")
        self.power_line = c.create_line(px, cy - 8, px, cy - 1, fill=COLORS["on"], width=2,
                                        tags="power")

        c.bind("<ButtonPress-1>", self._on_press)
        c.bind("<B1-Motion>", self._on_drag)
        c.bind("<ButtonRelease-1>", self._on_release)
        c.bind("<Button-3>", self._show_menu)
        c.bind("<Button-2>", self._show_menu)

        self._build_menu()
        root.update_idletasks()
        if IS_WIN:
            self._make_noactivate()

    def _rounded(self, x1, y1, x2, y2, r, **kw):
        pts = [x1 + r, y1, x2 - r, y1, x2, y1, x2, y1 + r, x2, y2 - r, x2, y2,
               x2 - r, y2, x1 + r, y2, x1, y2, x1, y2 - r, x1, y1 + r, x1, y1]
        return self.canvas.create_polygon(pts, smooth=True, **kw)

    def _make_noactivate(self):
        """Клик по виджету не забирает фокус у поля ввода, где стоит курсор."""
        try:
            import ctypes
            user32 = ctypes.windll.user32
            hwnd = user32.GetParent(self.root.winfo_id())
            GWL_EXSTYLE = -20
            WS_EX_NOACTIVATE = 0x08000000
            WS_EX_TOOLWINDOW = 0x00000080
            style = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
            user32.SetWindowLongW(hwnd, GWL_EXSTYLE, style | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW)
        except Exception:
            log.exception("WS_EX_NOACTIVATE не применился")

    def _build_menu(self):
        tk = self.tk
        m = self.menu = tk.Menu(self.root, tearoff=0)
        self.lang_var = tk.StringVar(value=self.cfg["language"])
        self.mode_var = tk.StringVar(value=self.cfg["hotkey_mode"])
        self.auto_var = tk.BooleanVar(value=bool(self.cfg.get("autostart")))
        names = {"auto": "Авто (RU / EN / UZ)", "ru": "Русский", "en": "English", "uz": "O'zbekcha"}
        for code in LANGS:
            m.add_radiobutton(label=names[code], value=code, variable=self.lang_var,
                              command=lambda: self._set_lang(self.lang_var.get()))
        m.add_separator()
        key = hotkey_label(self.cfg["hotkey"])
        m.add_radiobutton(label=f"{key}: нажал — говорю, нажал — стоп", value="toggle",
                          variable=self.mode_var, command=self._set_mode)
        m.add_radiobutton(label=f"{key}: говорю, пока держу", value="hold",
                          variable=self.mode_var, command=self._set_mode)
        m.add_separator()
        m.add_checkbutton(label="Запускать вместе с системой", variable=self.auto_var,
                          command=self._set_autostart)
        m.add_command(label="Настройки (config.json)…", command=self._open_config)
        m.add_command(label="Перезапустить", command=self._restart)
        m.add_separator()
        m.add_command(label="Выход", command=self._quit)

    # ------------------------------------------------------------ mouse

    def _on_press(self, e):
        self._press_xy = (e.x_root, e.y_root)
        self._win_xy = (self.root.winfo_x(), self.root.winfo_y())
        self._dragged = False
        tags = self.canvas.gettags("current")
        self._target = next((t for t in ("mic", "lang", "power") if t in tags), None)

    def _on_drag(self, e):
        dx = e.x_root - self._press_xy[0]
        dy = e.y_root - self._press_xy[1]
        if abs(dx) + abs(dy) > 4:
            self._dragged = True
        if self._dragged:
            self.root.geometry(f"+{self._win_xy[0] + dx}+{self._win_xy[1] + dy}")

    def _on_release(self, e):
        if self._dragged:
            self.cfg["position"] = [self.root.winfo_x(), self.root.winfo_y()]
            save_config(self.cfg)
        elif self._target == "mic":
            self._toggle_recording()
        elif self._target == "lang":
            i = LANGS.index(self.cfg["language"]) if self.cfg["language"] in LANGS else 0
            self._set_lang(LANGS[(i + 1) % len(LANGS)])
        elif self._target == "power":
            self._set_enabled(not self.enabled)

    def _show_menu(self, e):
        try:
            self.menu.tk_popup(e.x_root, e.y_root)
        finally:
            self.menu.grab_release()

    # ------------------------------------------------------------ actions

    def _toggle_recording(self):
        if self.recording:
            self._stop()
        else:
            self._start()

    def _start(self):
        if self.recording:
            return
        if not self.enabled:
            return self._flash("Виджет выключен")
        if not self.ready:
            return self._flash("Модель ещё грузится…")
        try:
            self.recorder.start()
            self.recording = True
        except Exception as ex:
            log.exception("микрофон не открылся")
            self._flash(f"Микрофон: {ex}")

    def _stop(self):
        if not self.recording:
            return
        self.recording = False
        try:
            self.recorder.stop()
        except Exception:
            log.exception("ошибка при остановке записи")

    def _set_lang(self, code):
        self.cfg["language"] = code
        self.lang_var.set(code)
        save_config(self.cfg)

    def _set_mode(self):
        self.cfg["hotkey_mode"] = self.mode_var.get()
        save_config(self.cfg)

    def _set_enabled(self, value):
        self.enabled = value
        if not value:
            self._stop()

    def _set_autostart(self):
        self.cfg["autostart"] = bool(self.auto_var.get())
        save_config(self.cfg)
        set_autostart(self.cfg["autostart"])

    def _open_config(self):
        if IS_WIN:
            os.startfile(CONFIG_PATH)
        elif IS_MAC:
            subprocess.Popen(["open", "-t", CONFIG_PATH])
        else:
            subprocess.Popen(["xdg-open", CONFIG_PATH])

    def _restart(self):
        release_single_instance()
        subprocess.Popen([_pythonw(), SCRIPT_PATH], cwd=APP_DIR)
        self._quit()

    def _quit(self):
        self._stop()
        self.root.destroy()
        os._exit(0)

    def _flash(self, msg, seconds=4):
        self.error = msg
        self.error_until = time.time() + seconds

    # ------------------------------------------------------------ worker

    def _worker(self):
        try:
            self.engine.load()
            self.ready = True
            log.info("движок готов: %s", self.cfg["engine"])
        except Exception as ex:
            log.exception("движок не загрузился")
            self.events.put(("error", f"Ошибка: {ex}", 30))
            return
        while True:
            audio, session = self.jobs.get()
            self.pending += 1
            try:
                lang = self.cfg["language"]
                text = clean_text(self.engine.transcribe(audio, None if lang == "auto" else lang))
                if text:
                    if self.last_session_pasted == session:
                        text = " " + text
                    self.typer.paste(text)
                    self.last_session_pasted = session
                    log.info("вставлено: %s", text)
            except Exception as ex:
                log.exception("ошибка распознавания")
                self.events.put(("error", f"Ошибка: {ex}", 6))
            finally:
                self.pending -= 1

    # ------------------------------------------------------------ ui loop

    def _tick(self):
        while True:
            try:
                ev = self.events.get_nowait()
            except queue.Empty:
                break
            if ev == "hotkey_down":
                if self.cfg["hotkey_mode"] == "hold":
                    self._start()
                else:
                    self._toggle_recording()
            elif ev == "hotkey_up":
                if self.cfg["hotkey_mode"] == "hold":
                    self._stop()
            elif isinstance(ev, tuple) and ev[0] == "error":
                self._flash(ev[1], ev[2])
        self._render()
        self.root.after(50, self._tick)

    def _render(self):
        c = self.canvas
        cx, cy = self.mic_center
        r = 15
        if not self.enabled:
            color, status = COLORS["off"], "Выключено"
        elif not self.ready and getattr(self.engine, "downloading", False):
            color, status = COLORS["loading"], "Скачиваю модель…"
        elif not self.ready:
            color, status = COLORS["loading"], "Загрузка модели…"
        elif self.recording:
            color, status = COLORS["rec"], "Слушаю…"
            r = 15 + min(5.0, self.recorder.level * 120)
        elif self.pending or not self.jobs.empty():
            color, status = COLORS["busy"], "Распознаю…"
        else:
            color, status = COLORS["idle"], f"{hotkey_label(self.cfg['hotkey'])} — говорить"
        if self.error and time.time() < self.error_until:
            status = self.error
        c.itemconfig(self.mic, fill=color)
        c.coords(self.mic, cx - r, cy - r, cx + r, cy + r)
        lang = self.cfg["language"]
        c.itemconfig(self.lang_text, text="AUTO" if lang == "auto" else lang.upper())
        c.itemconfig(self.status_text, text=status[:20] + ("…" if len(status) > 20 else ""))
        pcolor = COLORS["on"] if self.enabled else COLORS["muted"]
        c.itemconfig(self.power_arc, outline=pcolor)
        c.itemconfig(self.power_line, fill=pcolor)

    def _keep_on_top(self):
        self.root.attributes("-topmost", True)
        self.root.lift()
        self.root.after(3000, self._keep_on_top)

    def run(self):
        self.root.mainloop()


# ---------------------------------------------------------------- single instance

_mutex = None


def acquire_single_instance():
    global _mutex
    if IS_WIN:
        import ctypes
        _mutex = ctypes.windll.kernel32.CreateMutexW(None, False, "VoiceTypeSingleInstance")
        return ctypes.windll.kernel32.GetLastError() != 183  # ERROR_ALREADY_EXISTS
    return True


def release_single_instance():
    global _mutex
    if IS_WIN and _mutex:
        import ctypes
        ctypes.windll.kernel32.CloseHandle(_mutex)
        _mutex = None


if __name__ == "__main__":
    if not acquire_single_instance():
        sys.exit(0)
    App().run()
