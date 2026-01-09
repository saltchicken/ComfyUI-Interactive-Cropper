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

                "crop_data": ("STRING", {"default": "0,0,512,512", "multiline": False}),
            },
            "optional": {

                "images": ("IMAGE",),

                # but 'image' is standard for the widget name in ComfyUI)
                "image_upload": ("STRING", {"image_upload": True}),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    FUNCTION = "load_and_crop"
    CATEGORY = "image"
    

    OUTPUT_NODE = True 

    def load_and_crop(self, crop_data, images=None, image_upload=None):
        img = None
        preview_result = None


        if images is not None:
            # Take the first image in the batch for the preview/UI interaction
            # (ComfyUI tensors are [Batch, Height, Width, Channels])
            batch_img = images[0]
            
            # Convert Tensor to PIL for cropping logic
            i = 255. * batch_img.cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))


            preview_result = self._save_preview(img)


        elif image_upload is not None:
            image_path = folder_paths.get_annotated_filepath(image_upload)
            img = Image.open(image_path)
            img = ImageOps.exif_transpose(img)
            img = img.convert("RGB")
        
        # Validation
        if img is None:
             # Return a blank black image if nothing provided to prevent crash
             blank = torch.zeros((1, 512, 512, 3), dtype=torch.float32, device="cpu")
             return (blank, torch.zeros((1, 64, 64), dtype=torch.float32, device="cpu"))


        try:
            x, y, w, h = map(int, crop_data.split(','))
        except ValueError:
            x, y, w, h = 0, 0, img.width, img.height


        x = max(0, min(x, img.width - 1))
        y = max(0, min(y, img.height - 1))
        w = max(1, min(w, img.width - x))
        h = max(1, min(h, img.height - y))


        # If input was a batch, we crop the specific area on the *original tensor*
        # to preserve gradients or batch data if we wanted, 
        # but for this simple implementation we crop the PIL image we prepared.
        # If 'images' input was used, this applies to the first frame. 
        # To handle full batches properly, we should slice the tensor.
        
        if images is not None:
            # Crop the tensor batch directly: [:, y:y+h, x:x+w, :]
            # Ensure coordinates are within bounds for the tensor shape
            output_image = images[:, y:y+h, x:x+w, :]
        else:
            # Crop the PIL image
            crop_box = (x, y, x + w, y + h)
            cropped_img = img.crop(crop_box)
            output_image = np.array(cropped_img).astype(np.float32) / 255.0
            output_image = torch.from_numpy(output_image)[None,]

        # Create mask
        mask = torch.zeros((1, 64, 64), dtype=torch.float32, device="cpu")


        result = {"ui": {"images": []}, "result": (output_image, mask)}
        
        if preview_result:
            result["ui"]["images"].append(preview_result)

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
    def IS_CHANGED(s, crop_data, images=None, image_upload=None):

        if images is not None:
            return float("nan")
        if image_upload:
            image_path = folder_paths.get_annotated_filepath(image_upload)
            m = os.path.getmtime(image_path)
            return f"{m}_{crop_data}"
        return crop_data