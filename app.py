from PySide6.QtWidgets import QApplication
from ui.window import MainWindow

def main():
    app = QApplication([])
    window = MainWindow()
    window.show()
    app.exec()


