from __future__ import annotations
from dataclasses import dataclass
from typing import Optional


@dataclass 
class Playlist():
    items: list[str]
    index: int = 0

    def current(self) -> Optional[str]: 
        if not self.items:
            return None
        return self.items[self.index]

    def next(self) -> Optional[str]:
        if not self.items:
            return None
        self.index = (self.index + 1) % len(self.items)
        return self.current()

    def prev(self) -> Optional[str]:
        if not self.items:
            return None
        # modulo % wraps around list indexes
        self.index = (self.index - 1) % len(self.items)
        return self.current()       
