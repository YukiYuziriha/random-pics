from PySide6.QtWidgets import QMainWindow, QWidget, QVBoxLayout, QLabel, QPushButton


class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("random pics")
        center = QWidget(self)
        layout = QVBoxLayout(center)

        self.path_label = QLabel("send nudes!", self) # why self here
        layout.addWidget(self.path_label)
        
        self.prev_button = QPushButton("previous", self)
        self.next_button = QPushButton("next", self)
        self.pause_button = QPushButton("pause!", self)
        self.play_button = QPushButton("pause!", self)

        # TODO: ui shows play or pause button depending on timer state
        # or better logic here

        self.folder_button = QPushButton("switch folder...", self)

        # TODO: fot button in buttons??? 
        # do something about it, ask codex
        # layout.addWidget(button)
        
        center.setLayout(layout)
        self.setCentralWidget(center)

        
        
