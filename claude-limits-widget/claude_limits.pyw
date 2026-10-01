"""Claude Limits — маленький виджет поверх всех окон с лимитами Claude.

Показывает:
  * 5-часовой лимит (сессия) — процент использования и время до сброса;
  * недельный лимит — процент использования и время до сброса.

Откуда берутся цифры:
  1. Основной источник — сам Claude Code. После «claude_limits.pyw --install»
     Claude Code запускает этот же файл как строку состояния (statusLine) и
     передаёт ему лимиты после каждого ответа; они сохраняются в
     %USERPROFILE%\\.claude\\limits_widget_cache.json, а виджет их читает.
  2. Страница лимитов claude.ai (как «Настройки → Использование») — видит
     расход и в чате, и в Cowork, и в Claude Code. Нужен ключ сессии claude.ai
     (cookie sessionKey из браузера), его вставляют через меню виджета.
  3. Запасной — сервер api.anthropic.com/api/oauth/usage (как /usage).
     Он часто отвечает 429, поэтому виджет спрашивает его редко и только
     когда свежих данных из Claude Code нет.

Только стандартная библиотека Python — ничего ставить не нужно.
Управление: перетаскивать мышью, двойной клик — обновить,
правая кнопка — меню (обновить / компактный режим / выход).
"""

import json
import os
import sys
import threading
import time
import tkinter as tk
from tkinter import simpledialog
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

USAGE_URL = "https://api.anthropic.com/api/oauth/usage"
CLAUDE_DIR = Path(os.environ.get("CLAUDE_CONFIG_DIR", Path.home() / ".claude"))
CREDENTIALS = CLAUDE_DIR / ".credentials.json"
CACHE = CLAUDE_DIR / "limits_widget_cache.json"
SETTINGS = Path.home() / ".claude_limits_widget.json"
API_INTERVAL = 900             # сервер лимитов быстро отвечает 429 — спрашиваем редко
STALE_SECONDS = 900            # данные из Claude Code старше 15 мин считаем устаревшими
RATE_LIMIT_BACKOFF = 900
WEB_URL = "https://claude.ai/api/organizations"
WEB_INTERVAL = 120             # claude.ai спрашиваем раз в 2 минуты
BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36")
LOG = Path.home() / ".claude_limits_widget.log"

BG = "#1e1e1e"
FG = "#e6e6e6"
DIM = "#8a8a8a"
TRACK = "#3a3a3a"
ACCENT = "#d97757"  # фирменный оранжевый Claude


class LimitsError(Exception):
    def __init__(self, msg, retry_after=None):
        super().__init__(msg)
        self.retry_after = retry_after


def log(text):
    """Пишет подробности ошибок в %USERPROFILE%\\.claude_limits_widget.log."""
    try:
        with LOG.open("a", encoding="utf-8") as f:
            f.write(f"{datetime.now():%Y-%m-%d %H:%M:%S}  {text}\n")
    except OSError:
        pass


def server_message(body):
    try:
        return json.loads(body)["error"]["message"]
    except (ValueError, KeyError, TypeError):
        return body[:120]


def read_token():
    try:
        data = json.loads(CREDENTIALS.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise LimitsError("Нет входа в Claude Code.\nЗапустите claude и войдите.")
    except (OSError, ValueError):
        raise LimitsError("Не удалось прочитать\n.credentials.json")
    token = (data.get("claudeAiOauth") or {}).get("accessToken")
    if not token:
        raise LimitsError("Нет токена подписки.\nВойдите в Claude Code заново.")
    return token


def fetch_usage():
    req = urllib.request.Request(
        USAGE_URL,
        headers={
            "Authorization": f"Bearer {read_token()}",
            "anthropic-beta": "oauth-2025-04-20",
            "Content-Type": "application/json",
            "User-Agent": "claude-limits-widget/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise LimitsError("Токен истёк.\nОткройте Claude Code —\nон обновит вход.")
        body = e.read().decode("utf-8", "replace")
        log(f"HTTP {e.code}: {body[:500]}")
        msg = server_message(body)
        if e.code == 429:
            try:
                wait = int(e.headers.get("Retry-After") or RATE_LIMIT_BACKOFF)
            except ValueError:
                wait = RATE_LIMIT_BACKOFF
            wait = max(wait, 60)
            raise LimitsError("Сервер лимитов перегружен (429).\n"
                              "Цифры придут из Claude Code\nпосле следующего ответа.",
                              retry_after=wait)
        if e.code == 403 and "scope" in msg.lower():
            raise LimitsError("У токена нет доступа к лимитам.\n"
                              "В терминале: claude → /login\n(не setup-token).")
        raise LimitsError(f"Ошибка сервера {e.code}:\n{msg}")
    except (urllib.error.URLError, TimeoutError):
        raise LimitsError("Нет соединения")


def web_get(url, session_key):
    req = urllib.request.Request(url, headers={
        "Cookie": f"sessionKey={session_key}",
        "User-Agent": BROWSER_UA,
        "Accept": "application/json",
        "Referer": "https://claude.ai/settings/usage",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        log(f"claude.ai HTTP {e.code}: {body[:500]}")
        if e.code in (401, 403) and body.lstrip().startswith("{"):
            raise LimitsError("Ключ claude.ai устарел.\nПравая кнопка →\n«Ключ claude.ai…»")
        if e.code in (403, 503):
            raise LimitsError("claude.ai не пустил запрос\n(защита от ботов).")
        if e.code == 429:
            raise LimitsError("claude.ai: слишком частые\nзапросы, повторю позже.",
                              retry_after=RATE_LIMIT_BACKOFF)
        raise LimitsError(f"claude.ai: ошибка {e.code}")
    except (urllib.error.URLError, TimeoutError):
        raise LimitsError("Нет соединения")
    except ValueError:
        raise LimitsError("claude.ai ответил\nне так, как ожидалось.")


def pick_org(orgs):
    """Из списка организаций берём ту, где подписка Pro/Max (чат)."""
    if not orgs:
        raise LimitsError("В аккаунте claude.ai\nнет организаций.")
    for org in orgs:
        caps = org.get("capabilities") or []
        if any(c in caps for c in ("claude_max", "claude_pro")):
            return org["uuid"]
    for org in orgs:
        if "chat" in (org.get("capabilities") or []):
            return org["uuid"]
    return orgs[0]["uuid"]


def fetch_web_usage(session_key, org_id=None):
    """-> (данные лимитов, org_id). Формат тот же, что у /api/oauth/usage."""
    if not org_id:
        org_id = pick_org(web_get(WEB_URL, session_key))
    return web_get(f"{WEB_URL}/{org_id}/usage", session_key), org_id


def parse_limit(block):
    """Блок лимита -> (процент, datetime|None).

    Сервер присылает {'utilization': 42.0, 'resets_at': '2026-...Z'},
    Claude Code — {'used_percentage': 42.0, 'resets_at': 1790000000}.
    """
    if not block:
        return None
    pct = block.get("used_percentage", block.get("utilization"))
    pct = float(pct or 0)
    resets = block.get("resets_at")
    when = None
    try:
        if isinstance(resets, (int, float)):
            when = datetime.fromtimestamp(resets, timezone.utc)
        elif resets:
            when = datetime.fromisoformat(resets.replace("Z", "+00:00"))
    except (ValueError, OSError, OverflowError):
        pass
    return pct, when


def read_cache():
    try:
        return json.loads(CACHE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


# --- режим строки состояния Claude Code (--statusline) ----------------------
def statusline_main():
    """Claude Code передаёт сюда JSON сессии; сохраняем лимиты и печатаем строку."""
    try:
        data = json.loads(sys.stdin.buffer.read().decode("utf-8") or "{}")
    except ValueError:
        data = {}
    limits = data.get("rate_limits") or {}
    if limits:
        try:
            tmp = CACHE.with_suffix(".tmp")
            tmp.write_text(json.dumps({"saved": time.time(), **limits}), encoding="utf-8")
            os.replace(tmp, CACHE)
        except OSError:
            pass
    parts = [(data.get("model") or {}).get("display_name") or "Claude"]
    for key, name in (("five_hour", "5ч"), ("seven_day", "нед")):
        lim = parse_limit(limits.get(key))
        if lim:
            parts.append(f"{name} {lim[0]:.0f}%")
    sys.stdout.buffer.write(" · ".join(parts).encode("utf-8"))


def install_main():
    """Прописывает этот файл строкой состояния в ~/.claude/settings.json."""
    settings_path = CLAUDE_DIR / "settings.json"
    try:
        settings = json.loads(settings_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        settings = {}
    except (OSError, ValueError) as e:
        print(f"Не удалось прочитать {settings_path}: {e}")
        return
    python = Path(sys.executable)
    if python.name.lower() == "pythonw.exe":
        python = python.with_name("python.exe")
    # прямые слэши работают и в cmd, и в Git Bash, через который Claude Code запускает команду
    command = f'"{python.as_posix()}" "{Path(__file__).resolve().as_posix()}" --statusline'
    old = settings.get("statusLine")
    if old and old.get("command") != command:
        print(f"Сейчас в Claude Code уже настроена строка состояния:\n  {old.get('command')}")
        if input("Заменить её на виджет лимитов? (y/n): ").strip().lower() not in ("y", "д", "yes", "да"):
            print("Ничего не изменено.")
            return
        settings_path.with_suffix(".json.bak").write_text(
            settings_path.read_text(encoding="utf-8"), encoding="utf-8")
        print("Старые настройки сохранены в settings.json.bak")
    settings["statusLine"] = {"type": "command", "command": command}
    CLAUDE_DIR.mkdir(parents=True, exist_ok=True)
    settings_path.write_text(json.dumps(settings, indent=2, ensure_ascii=False), encoding="utf-8")
    print("Готово. Перезапустите Claude Code — после первого ответа\n"
          "лимиты появятся внизу Claude Code и в виджете.")


def format_left(when):
    if when is None:
        return ""
    secs = int((when - datetime.now(timezone.utc)).total_seconds())
    if secs <= 0:
        return "сброс сейчас"
    d, rem = divmod(secs, 86400)
    h, rem = divmod(rem, 3600)
    m = rem // 60
    if d:
        return f"сброс через {d}д {h}ч"
    if h:
        return f"сброс через {h}ч {m:02d}м"
    return f"сброс через {m}м"


def bar_color(pct):
    if pct >= 90:
        return "#e5534b"
    if pct >= 70:
        return "#e0a33a"
    return "#57ab5a"


class Row:
    WIDTH = 190

    def __init__(self, parent, title):
        self.frame = tk.Frame(parent, bg=BG)
        top = tk.Frame(self.frame, bg=BG)
        top.pack(fill="x")
        tk.Label(top, text=title, bg=BG, fg=FG, font=("Segoe UI", 9)).pack(side="left")
        self.pct = tk.Label(top, text="—", bg=BG, fg=FG, font=("Segoe UI", 9, "bold"))
        self.pct.pack(side="right")
        self.canvas = tk.Canvas(self.frame, width=self.WIDTH, height=6, bg=TRACK,
                                highlightthickness=0)
        self.canvas.pack(fill="x", pady=(2, 1))
        self.bar = self.canvas.create_rectangle(0, 0, 0, 6, width=0, fill=ACCENT)
        self.reset = tk.Label(self.frame, text="", bg=BG, fg=DIM, font=("Segoe UI", 8))
        self.reset.pack(anchor="w")
        self.when = None

    def set(self, limit):
        if limit is None:
            self.pct.config(text="—")
            self.canvas.coords(self.bar, 0, 0, 0, 6)
            self.when = None
            self.tick()
            return
        pct, self.when = limit
        self.pct.config(text=f"{pct:.0f}%")
        width = max(0, min(100, pct)) / 100 * self.WIDTH
        self.canvas.coords(self.bar, 0, 0, width, 6)
        self.canvas.itemconfig(self.bar, fill=bar_color(pct))
        self.tick()

    def tick(self):
        self.reset.config(text=format_left(self.when))


class Widget:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Claude Limits")
        self.root.overrideredirect(True)          # без рамки окна
        self.root.attributes("-topmost", True)    # поверх всех окон
        self.root.attributes("-alpha", 0.92)
        self.root.configure(bg=BG)

        self.settings = self.load_settings()
        self.compact = self.settings.get("compact", False)

        body = tk.Frame(self.root, bg=BG, padx=10, pady=8,
                        highlightthickness=1, highlightbackground="#444")
        body.pack(fill="both", expand=True)

        head = tk.Frame(body, bg=BG)
        head.pack(fill="x", pady=(0, 4))
        tk.Label(head, text="✳ Claude", bg=BG, fg=ACCENT,
                 font=("Segoe UI", 9, "bold")).pack(side="left")
        self.status = tk.Label(head, text="…", bg=BG, fg=DIM, font=("Segoe UI", 8))
        self.status.pack(side="right")

        self.session = Row(body, "Сессия (5 ч)")
        self.session.frame.pack(fill="x", pady=(0, 4))
        self.week = Row(body, "Неделя")
        self.week.frame.pack(fill="x")

        self.error = tk.Label(body, text="", bg=BG, fg="#e5534b",
                              font=("Segoe UI", 8), justify="left")

        self.menu = tk.Menu(self.root, tearoff=0)
        self.menu.add_command(label="Обновить сейчас", command=self.refresh)
        self.menu.add_command(label="Ключ claude.ai…", command=self.ask_session_key)
        self.menu.add_command(label="Компактный режим", command=self.toggle_compact)
        self.menu.add_separator()
        self.menu.add_command(label="Выход", command=self.quit)

        for w in self.all_widgets(self.root):
            if isinstance(w, tk.Menu):
                continue
            w.bind("<ButtonPress-1>", self.start_drag)
            w.bind("<B1-Motion>", self.drag)
            w.bind("<ButtonRelease-1>", self.save_position)
            w.bind("<Double-Button-1>", lambda e: self.refresh())
            w.bind("<Button-3>", self.show_menu)

        self.cache_mtime = None
        self._job = None
        self.apply_compact()
        self.place_window()
        self.poll_cache()
        self.maybe_refresh()
        self.tick()

    # --- окно -------------------------------------------------------------
    def all_widgets(self, w):
        yield w
        for child in w.winfo_children():
            yield from self.all_widgets(child)

    def place_window(self):
        self.root.update_idletasks()
        x, y = self.settings.get("x"), self.settings.get("y")
        sw, sh = self.root.winfo_screenwidth(), self.root.winfo_screenheight()
        w, h = self.root.winfo_reqwidth(), self.root.winfo_reqheight()
        if x is None or y is None or not (0 <= x < sw - 20 and 0 <= y < sh - 20):
            x, y = sw - w - 16, sh - h - 60  # правый нижний угол над панелью задач
        self.root.geometry(f"+{x}+{y}")

    def start_drag(self, e):
        self._dx = e.x_root - self.root.winfo_x()
        self._dy = e.y_root - self.root.winfo_y()

    def drag(self, e):
        self.root.geometry(f"+{e.x_root - self._dx}+{e.y_root - self._dy}")

    def save_position(self, _e=None):
        self.settings.update(x=self.root.winfo_x(), y=self.root.winfo_y())
        self.save_settings()

    def show_menu(self, e):
        self.menu.tk_popup(e.x_root, e.y_root)

    def toggle_compact(self):
        self.compact = not self.compact
        self.settings["compact"] = self.compact
        self.save_settings()
        self.apply_compact()

    def apply_compact(self):
        for row in (self.session, self.week):
            if self.compact:
                row.reset.pack_forget()
            else:
                row.reset.pack(anchor="w")

    def quit(self):
        self.save_position()
        self.root.destroy()

    # --- настройки ---------------------------------------------------------
    def load_settings(self):
        try:
            return json.loads(SETTINGS.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def save_settings(self):
        try:
            SETTINGS.write_text(json.dumps(self.settings), encoding="utf-8")
        except OSError:
            pass

    # --- данные ------------------------------------------------------------
    def cache_is_fresh(self):
        try:
            return time.time() - CACHE.stat().st_mtime < STALE_SECONDS
        except OSError:
            return False

    def poll_cache(self):
        """Каждые 5 с проверяет, не прислал ли Claude Code новые цифры."""
        try:
            mtime = CACHE.stat().st_mtime
        except OSError:
            mtime = None
        if mtime and mtime != self.cache_mtime:
            data = read_cache()
            if data:
                self.cache_mtime = mtime
                self.show_data(data, datetime.fromtimestamp(data.get("saved", mtime)))
        self.root.after(5000, self.poll_cache)

    def interval(self):
        return WEB_INTERVAL if self.settings.get("session_key") else API_INTERVAL

    def maybe_refresh(self):
        """claude.ai спрашиваем всегда; сервер Claude Code — только если
        из самого Claude Code давно ничего не приходило."""
        if not self.settings.get("session_key") and self.cache_is_fresh():
            self.schedule(self.interval())
        else:
            self.refresh()

    def ask_session_key(self):
        key = simpledialog.askstring(
            "Ключ claude.ai",
            "Вставьте значение cookie sessionKey с claude.ai\n"
            "(начинается с sk-ant-sid…). Пустое поле — удалить ключ.\n"
            "Ключ хранится только на этом компьютере.",
            parent=self.root, show="*")
        if key is None:
            return
        key = key.strip()
        if key.lower().startswith("sessionkey="):
            key = key.split("=", 1)[1]
        self.settings.pop("org_id", None)
        if key:
            self.settings["session_key"] = key
        else:
            self.settings.pop("session_key", None)
        self.save_settings()
        self.refresh()

    def refresh(self):
        self.status.config(text="обновление…")
        threading.Thread(target=self._load, daemon=True).start()

    def _load(self):
        try:
            key = self.settings.get("session_key")
            if key:
                data, org_id = fetch_web_usage(key, self.settings.get("org_id"))
                if org_id != self.settings.get("org_id"):
                    self.settings["org_id"] = org_id
                    self.root.after(0, self.save_settings)
            else:
                data = fetch_usage()
            self.root.after(0, self.show_data, data)
        except LimitsError as e:
            self.root.after(0, self.show_error, str(e), e.retry_after)
        except Exception as e:
            log(f"Unexpected: {e!r}")  # не даём виджету упасть
            self.root.after(0, self.show_error, f"Ошибка: {e}")

    def show_data(self, data, at=None):
        self.error.pack_forget()
        self.session.set(parse_limit(data.get("five_hour")))
        self.week.set(parse_limit(data.get("seven_day")))
        self.status.config(text=(at or datetime.now()).strftime("%H:%M"))
        self.schedule(self.interval())

    def show_error(self, msg, retry_after=None):
        # последние полученные цифры остаются на экране, ниже — причина ошибки
        self.error.config(text=msg)
        self.error.pack(anchor="w", pady=(4, 0))
        self.status.config(text="ошибка")
        self.schedule(max(retry_after or 0, self.interval()))

    def schedule(self, seconds):
        if self._job:
            self.root.after_cancel(self._job)
        self._job = self.root.after(seconds * 1000, self.maybe_refresh)

    def tick(self):
        """Каждые 30 с обновляет обратный отсчёт до сброса без запроса к серверу."""
        self.session.tick()
        self.week.tick()
        self.root.after(30_000, self.tick)

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    if "--statusline" in sys.argv:
        statusline_main()
    elif "--install" in sys.argv:
        install_main()
    else:
        Widget().run()
