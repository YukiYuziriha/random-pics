from domain.playlist import Playlist


class AppController:
    def __init__(self) -> None:
        self.playlist = Playlist([])

    def on_folder_selected(self, paths: list[str]) -> str | None:
        self.playlist = Playlist(paths)

        return self.current()

    def current(self) -> str | None:
        return self.playlist.current()

    def on_next(self) -> str | None:
        return self.playlist.next()

    def on_prev(self) -> str | None:
        return self.playlist.prev()
