from .cropper_node import InteractiveCropNode

# ‼️ Register the node class with a display name
NODE_CLASS_MAPPINGS = {
    "InteractiveCropNode": InteractiveCropNode
}

# ‼️ Human readable name for the menu
NODE_DISPLAY_NAME_MAPPINGS = {
    "InteractiveCropNode": "Interactive Image Cropper"
}

# ‼️ Expose the web directory so ComfyUI loads the JS file automatically
WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
