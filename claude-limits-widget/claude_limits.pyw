"""Claude Limits — маленький виджет поверх всех окон с лимитами Claude.

Показывает:
  * 5-часовой лимит (сессия) — процент использования и время до сброса;
  * недельный лимит — процент использования и время до сброса.

Данные берутся из того же источника, что и команда /usage в Claude Code:
токен входа читается из %USERPROFILE%\\.claude\\.credentials.json
(файл появляется после входа в Claude Code через подписку Pro/Max).

Только стандартная библиотека Python — ничего ставить не нужно.
Управление: перетаскивать мышью, двойной клик — обновить,
правая кнопка — меню (обновить / компактный режим / выход).
"""

import json
import os
import threading
import tkinter as tk
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

USAGE_URL = "https://api.anthropic.com/api/oauth/usage"
CREDENTIALS = Path(os.environ.get("CLAUDE_CONFIG_DIR", Path.home() / ".claude")) / ".credentials.json"
SETTINGS = Path.home() / ".claude_limits_widget.json"
REFRESH_SECONDS = 180          # сервер ограничивает частые запросы (429)
RATE_LIMIT_BACKOFF = 600
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
            raise LimitsError(f"Сервер просит подождать.\nПовтор через {wait // 60} мин.",
                              retry_after=wait)
        if e.code == 403 and "scope" in msg.lower():
            raise LimitsError("У токена нет доступа к лимитам.\n"
                              "В терминале: claude → /login\n(не setup-token).")
        raise LimitsError(f"Ошибка сервера {e.code}:\n{msg}")
    except (urllib.error.URLError, TimeoutError):
        raise LimitsError("Нет соединения")


def parse_limit(block):
    """{'utilization': 42.0, 'resets_at': '...'} -> (процент, datetime|None)."""
    if not block:
        return None
    pct = float(block.get("utilization") or 0)
    resets = block.get("resets_at")
    when = None
    if resets:
        try:
            when = datetime.fromisoformat(resets.replace("Z", "+00:00"))
        except ValueError:
            pass
    return pct, when


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
        self.menu.add_command(label="Обновить", command=self.refresh)
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

        self.apply_compact()
        self.place_window()
        self.refresh()
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
    def refresh(self):
        self.status.config(text="обновление…")
        threading.Thread(target=self._load, daemon=True).start()

    def _load(self):
        try:
            data = fetch_usage()
            self.root.after(0, self.show_data, data)
        except LimitsError as e:
            self.root.after(0, self.show_error, str(e), e.retry_after)
        except Exception as e:
            log(f"Unexpected: {e!r}")  # не даём виджету упасть
            self.root.after(0, self.show_error, f"Ошибка: {e}")

    def show_data(self, data):
        self.error.pack_forget()
        self.session.set(parse_limit(data.get("five_hour")))
        self.week.set(parse_limit(data.get("seven_day")))
        self.status.config(text=datetime.now().strftime("%H:%M"))
        self.schedule(REFRESH_SECONDS)

    def show_error(self, msg, retry_after=None):
        # последние полученные цифры остаются на экране, ниже — причина ошибки
        self.error.config(text=msg)
        self.error.pack(anchor="w", pady=(4, 0))
        self.status.config(text="ошибка")
        self.schedule(retry_after or REFRESH_SECONDS)

    def schedule(self, seconds):
        if getattr(self, "_job", None):
            self.root.after_cancel(self._job)
        self._job = self.root.after(seconds * 1000, self.refresh)

    def tick(self):
        """Каждые 30 с обновляет обратный отсчёт до сброса без запроса к серверу."""
        self.session.tick()
        self.week.tick()
        self.root.after(30_000, self.tick)

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    Widget().run()
