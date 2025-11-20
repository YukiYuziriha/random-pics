import pytest
from domain.playlist import Playlist


def test_empty_list():
    playlist = Playlist([])

    assert playlist.current() is None
    assert playlist.next() is None
    assert playlist.prev() is None                        
