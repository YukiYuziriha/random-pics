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
        self.switch_button = QPushButton("play!", self)
        self.folder_button = QPushButton("switch folder...", self)

        layout.addWidget(self.prev_button)
        layout.addWidget(self.next_button)
        layout.addWidget(self.switch_button)
        layout.addWidget(self.folder_button)
        
        self.prev_button.clicked.connect(self._on_prev)
        self.next_button.clicked.connect(self._on_next)
        self.switch_button.clicked.connect(self._on_switch)
        self.folder_button.clicked.connect(self._on_folder)

        center.setLayout(layout)
        self.setCentralWidget(center)

    def _on_prev(self):
        print("prev??")

    def _on_next(self):
        print("next??")

    def _on_switch(self):
        print("switch??")

    def _on_folder(self):
        print("folder??")

    
