from .cropper_node import InteractiveCropNode


NODE_CLASS_MAPPINGS = {
    "InteractiveCropNode": InteractiveCropNode
}


NODE_DISPLAY_NAME_MAPPINGS = {
    "InteractiveCropNode": "Interactive Image Cropper"
}


WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]