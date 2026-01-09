import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "Comfy.InteractiveCropper",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "InteractiveCropNode") {
            return;
        }

        // ‼️ Extend the node creation to set up our interactive canvas
        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

            this.uploaded_image = null;
            this.img_obj = new Image();
            
            // ‼️ State for the crop box (replacing CropBox properties)
            this.crop = { x: 0, y: 0, w: 512, h: 512 };
            this.dragState = { isDragging: false, startX: 0, startY: 0, initialCropX: 0, initialCropY: 0 };
            this.resizeState = { isResizing: false, corner: null }; // Optional: for future resizing implementation

            // Find widgets
            this.uploadWidget = this.widgets.find(w => w.name === "image");
            this.coordWidget = this.widgets.find(w => w.name === "crop_data");
            
            // ‼️ Hide the coordinate widget (we update it programmatically)
            if (this.coordWidget) {
                this.coordWidget.type = "hidden"; // Hide from standard view
            }

            // ‼️ Hook into the upload widget to detect when a new image is loaded
            const originalCallback = this.uploadWidget.callback;
            this.uploadWidget.callback = (v) => {
                originalCallback?.(v);
                this.loadPreviewImage(v);
            };

            // Initial load if value exists
            if (this.uploadWidget.value) {
                this.loadPreviewImage(this.uploadWidget.value);
            }

            // ‼️ Set the node size slightly larger to accommodate the image preview
            this.setSize([530, 600]);

            return r;
        };

        // ‼️ Function to fetch the image from ComfyUI server
        nodeType.prototype.loadPreviewImage = function(filename) {
            if (!filename) return;
            // Construct the path to the view API
            const src = api.apiURL(`/view?filename=${encodeURIComponent(filename)}&type=input&subfolder=&format=image`);
            this.img_obj.src = src;
            this.img_obj.onload = () => {
                this.uploaded_image = this.img_obj;
                
                // ‼️ Reset crop box to center or keep existing if valid
                // This mimics setting the QGraphicsRectItem
                if (this.crop.w > this.img_obj.width) this.crop.w = this.img_obj.width;
                if (this.crop.h > this.img_obj.height) this.crop.h = this.img_obj.height;
                
                this.setDirtyCanvas(true, true); // Force redraw
            };
        };

        // ‼️ The Main Drawing Loop (Replacment for QGraphicsView paint events)
        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function (ctx) {
            if (onDrawForeground) onDrawForeground.apply(this, arguments);

            if (!this.uploaded_image) return;

            // Define the display area on the node (padding from top/sides)
            const margin = 10;
            const top_padding = 40; // Space for widgets
            const displayWidth = this.size[0] - (margin * 2);
            
            // Calculate scale to fit image in node width
            const scale = displayWidth / this.uploaded_image.width;
            const displayHeight = this.uploaded_image.height * scale;

            this.imageArea = {
                x: margin,
                y: top_padding,
                w: displayWidth,
                h: displayHeight,
                scale: scale
            };

            // 1. Draw the Image
            ctx.save();
            ctx.drawImage(this.uploaded_image, this.imageArea.x, this.imageArea.y, this.imageArea.w, this.imageArea.h);

            // 2. Draw the Crop Box (The "Red Box" from PyQt)
            // Convert image coordinates to node display coordinates
            const boxX = this.imageArea.x + (this.crop.x * scale);
            const boxY = this.imageArea.y + (this.crop.y * scale);
            const boxW = this.crop.w * scale;
            const boxH = this.crop.h * scale;

            // Semi-transparent red fill
            ctx.fillStyle = "rgba(255, 0, 0, 0.2)";
            ctx.fillRect(boxX, boxY, boxW, boxH);

            // Solid red border
            ctx.strokeStyle = "red";
            ctx.lineWidth = 2;
            ctx.strokeRect(boxX, boxY, boxW, boxH);
            
            // Draw Dimensions Text
            ctx.fillStyle = "white";
            ctx.font = "12px Arial";
            ctx.fillText(`${Math.round(this.crop.w)}x${Math.round(this.crop.h)}`, boxX, boxY - 5);

            ctx.restore();
        };

        // ‼️ Handle Mouse Input (Replacement for QGraphicsRectItem.itemChange/mouse events)
        
        nodeType.prototype.onMouseDown = function(e, local_pos) {
            if (!this.imageArea) return;

            const [mx, my] = local_pos;
            const scale = this.imageArea.scale;

            // Calculate Box screen coordinates
            const boxX = this.imageArea.x + (this.crop.x * scale);
            const boxY = this.imageArea.y + (this.crop.y * scale);
            const boxW = this.crop.w * scale;
            const boxH = this.crop.h * scale;

            // Check if mouse is inside the crop box
            if (mx >= boxX && mx <= boxX + boxW && my >= boxY && my <= boxY + boxH) {
                this.dragState.isDragging = true;
                this.dragState.startX = mx;
                this.dragState.startY = my;
                this.dragState.initialCropX = this.crop.x;
                this.dragState.initialCropY = this.crop.y;
                return true; // Capture event
            }
            return false;
        };

        nodeType.prototype.onMouseMove = function(e, local_pos) {
            if (this.dragState.isDragging && this.imageArea) {
                const [mx, my] = local_pos;
                const scale = this.imageArea.scale;

                // Calculate delta in Image Pixels
                const dx_screen = mx - this.dragState.startX;
                const dy_screen = my - this.dragState.startY;
                
                const dx_image = dx_screen / scale;
                const dy_image = dy_screen / scale;

                let newX = this.dragState.initialCropX + dx_image;
                let newY = this.dragState.initialCropY + dy_image;

                // ‼️ Clamp Logic (Directly ported from CropBox.itemChange)
                if (newX < 0) newX = 0;
                if (newY < 0) newY = 0;
                if (newX + this.crop.w > this.uploaded_image.width) newX = this.uploaded_image.width - this.crop.w;
                if (newY + this.crop.h > this.uploaded_image.height) newY = this.uploaded_image.height - this.crop.h;

                this.crop.x = newX;
                this.crop.y = newY;

                this.setDirtyCanvas(true, true); // Redraw
                return true;
            }
        };

        nodeType.prototype.onMouseUp = function(e, local_pos) {
            if (this.dragState.isDragging) {
                this.dragState.isDragging = false;
                
                // ‼️ Update the backend widget
                // Format: "x,y,w,h" (int)
                if (this.coordWidget) {
                    const data = `${Math.round(this.crop.x)},${Math.round(this.crop.y)},${Math.round(this.crop.w)},${Math.round(this.crop.h)}`;
                    this.coordWidget.value = data;
                }
                return true;
            }
        };
    }
});
