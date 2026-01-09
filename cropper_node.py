import os
import torch
import numpy as np
from PIL import Image, ImageOps
import folder_paths
import random

class InteractiveCropNode:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {

                "images": ("IMAGE",),

                "crop_data": ("STRING", {"default": "0,0,512,512", "multiline": False}),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    FUNCTION = "load_and_crop"
    CATEGORY = "image"
    

    OUTPUT_NODE = True 

    def load_and_crop(self, images, crop_data):
        img = None
        preview_result = None


        # Take the first image in the batch for the preview/UI interaction
        batch_img = images[0]
        
        # Convert Tensor to PIL for cropping logic
        i = 255. * batch_img.cpu().numpy()
        img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))


        preview_result = self._save_preview(img)


        try:
            x, y, w, h = map(int, crop_data.split(','))
        except ValueError:
            x, y, w, h = 0, 0, img.width, img.height


        x = max(0, min(x, img.width - 1))
        y = max(0, min(y, img.height - 1))
        w = max(1, min(w, img.width - x))
        h = max(1, min(h, img.height - y))


        # Crop the tensor batch directly: [:, y:y+h, x:x+w, :]
        output_image = images[:, y:y+h, x:x+w, :]

        # Create mask
        mask = torch.zeros((1, 64, 64), dtype=torch.float32, device="cpu")


        # CHANGED: Use a custom key 'crop_preview' instead of 'images'
        # This prevents ComfyUI from automatically attaching its own PreviewImage widget
        result = {"ui": {"crop_preview": []}, "result": (output_image, mask)}
        
        if preview_result:
            result["ui"]["crop_preview"].append(preview_result)

        return result

    def _save_preview(self, img):
        # Helper to save a temp file for the frontend to display
        output_dir = folder_paths.get_temp_directory()
        filename_prefix = "interactive_crop_preview"
        
        # Save filename
        filename = f"{filename_prefix}_{random.randint(1, 1000000)}.png"
        full_path = os.path.join(output_dir, filename)
        img.save(full_path)
        
        return {
            "filename": filename,
            "subfolder": "",
            "type": "temp"
        }

    @classmethod
    def IS_CHANGED(s, images, crop_data):
        return float("nan")