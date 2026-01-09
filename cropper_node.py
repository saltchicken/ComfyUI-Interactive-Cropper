import os
import torch
import numpy as np
from PIL import Image, ImageOps
import folder_paths

class InteractiveCropNode:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                # ‼️ Uses the standard image upload widget.
                # This string will contain the filename of the uploaded image.
                "image": ("STRING", {"image_upload": True}),
                
                # ‼️ A hidden string input to receive the coordinates from Javascript.
                # Format: "x,y,width,height"
                # Corresponds to your PyQt crop_item.pos() and rect logic.
                "crop_data": ("STRING", {"default": "0,0,512,512", "multiline": False}),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    FUNCTION = "load_and_crop"
    CATEGORY = "image"

    def load_and_crop(self, image, crop_data):
        # 1. Load the image (Standard ComfyUI LoadImage logic)
        image_path = folder_paths.get_annotated_filepath(image)
        img = Image.open(image_path)
        
        # Handle orientation (EXIF data)
        img = ImageOps.exif_transpose(img)
        
        # Ensure RGB
        img = img.convert("RGB")

        # ‼️ Parse the crop coordinates passed from the JS frontend
        # This replaces the QGraphicsRectItem logic from the python script
        try:
            x, y, w, h = map(int, crop_data.split(','))
        except ValueError:
            # Fallback if data is invalid
            x, y, w, h = 0, 0, img.width, img.height

        # ‼️ Sanity Checks / Clamping (Logic ported from CropBox.itemChange)
        # Ensure we don't crop outside bounds
        x = max(0, min(x, img.width - 1))
        y = max(0, min(y, img.height - 1))
        w = max(1, min(w, img.width - x))
        h = max(1, min(h, img.height - y))

        # ‼️ Perform the Crop (equivalent to img.crop in overwrite_image)
        crop_box = (x, y, x + w, y + h)
        cropped_img = img.crop(crop_box)

        # Convert to Tensor (ComfyUI Format: Batch, Height, Width, Channel)
        output_image = np.array(cropped_img).astype(np.float32) / 255.0
        output_image = torch.from_numpy(output_image)[None,]

        # Create a mask (optional, but good practice)
        mask = torch.zeros((64, 64), dtype=torch.float32, device="cpu")

        return (output_image, mask)

    @classmethod
    def IS_CHANGED(s, image, crop_data):
        # ‼️ Ensure the node re-runs if the crop box moves or image changes
        image_path = folder_paths.get_annotated_filepath(image)
        m = os.path.getmtime(image_path)
        return f"{m}_{crop_data}"
