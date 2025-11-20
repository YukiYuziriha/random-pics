import pytest
from domain.playlist import Playlist


def test_empty_list():
    playlist = Playlist([])

    assert playlist.current() is None
    assert playlist.next() is None
    assert playlist.prev() is None                        

@pytest.fixture
def playlist_abc():
    return Playlist(["a", "b", "c"])

def test_next_logic(playlist_abc):
    assert playlist_abc.current() == "a"
    assert playlist_abc.next() == "b"
    assert playlist_abc.next() == "c"
    assert playlist_abc.next() == "a" # wrapping 

def test_prev_logic(playlist_abc):
    assert playlist_abc.current() == "a"
    assert playlist_abc.prev() == "c" # wrapping
    assert playlist_abc.prev() == "b"
    assert playlist_abc.prev() == "a" 

    
def test_single_item_stays_same():
    playlist_a = Playlist(["a"])

    assert playlist_a.current() == "a"
    assert playlist_a.next() == "a"
    assert playlist_a.prev() == "a"
