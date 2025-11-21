from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Playlist:
    """Playlist class logic for switching between files"""
    items: list[str]
    index: int = 0

    def current(self) -> str | None:
        if not self.items:
            return None
        return self.items[self.index]

    def next(self) -> str | None:
        if not self.items:
            return None
        self.index = (self.index + 1) % len(self.items)
        return self.current()

    def prev(self) -> str | None:
        if not self.items:
            return None
        # modulo % wraps around list indexes
        self.index = (self.index - 1) % len(self.items)
        return self.current()
