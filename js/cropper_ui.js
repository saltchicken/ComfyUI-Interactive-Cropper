import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "Comfy.InteractiveCropper",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "InteractiveCropNode") {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

            this.uploaded_image = null;
            this.img_obj = new Image();
            
            this.crop = { x: 0, y: 0, w: 512, h: 512 };
            this.dragState = { isDragging: false, startX: 0, startY: 0, initialCropX: 0, initialCropY: 0 };

            // Find the specific integer widgets instead of the hidden string widget
            this.widgetX = this.widgets.find(w => w.name === "x");
            this.widgetY = this.widgets.find(w => w.name === "y");
            this.widgetW = this.widgets.find(w => w.name === "crop_width");
            this.widgetH = this.widgets.find(w => w.name === "crop_height");

            // Create a callback to update internal state when widgets change
            const callback = () => {
                if (this.widgetX) this.crop.x = this.widgetX.value;
                if (this.widgetY) this.crop.y = this.widgetY.value;
                if (this.widgetW) this.crop.w = this.widgetW.value;
                if (this.widgetH) this.crop.h = this.widgetH.value;
                this.setDirtyCanvas(true, true);
            };

            // Attach callback to all widgets
            if (this.widgetX) this.widgetX.callback = callback;
            if (this.widgetY) this.widgetY.callback = callback;
            if (this.widgetW) this.widgetW.callback = callback;
            if (this.widgetH) this.widgetH.callback = callback;

            // Initialize internal state from default widget values
            callback();

            // Set a default size for the node to accommodate the canvas drawing
            this.setSize([530, 600]);

            return r;
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function(message) {
            onExecuted?.apply(this, arguments);

            if (message && message.crop_preview && message.crop_preview.length > 0) {
                const img = message.crop_preview[0];
                this.loadPreviewImage(img.filename, img.subfolder, img.type);
            }
        };


        nodeType.prototype.getWidgetHeight = function() {
            if (!this.widgets || this.widgets.length === 0) return 40;
            // Scan widgets to find the bottom-most position
            let bottomY = 0;
            for(const w of this.widgets) {
                // ComfyUI widgets usually have last_y populated after first draw, 
                // or we can estimate based on index if not yet drawn.
                const y = w.last_y || (this.widgets.indexOf(w) * 20); 
                const h = w.computeSize ? w.computeSize()[1] : 20;
                bottomY = Math.max(bottomY, y + h);
            }
            return bottomY + 20; // Add padding
        };

        nodeType.prototype.loadPreviewImage = function(filename, subfolder = "", type = "input") {
            if (!filename) return;
            
            const params = new URLSearchParams({
                filename: filename,
                type: type,
                subfolder: subfolder,
                format: "image"
            });

            const src = api.apiURL(`/view?${params.toString()}`);
            
            this.img_obj.src = src;
            this.img_obj.onload = () => {
                this.uploaded_image = this.img_obj;
                
                // Sanity check dimensions
                if (this.crop.w > this.img_obj.width) this.crop.w = this.img_obj.width;
                if (this.crop.h > this.img_obj.height) this.crop.h = this.img_obj.height;
                

                const widgetHeight = this.getWidgetHeight();
                const margin = 10;
                const targetWidth = this.size[0]; // Keep current width
                const displayWidth = targetWidth - (margin * 2);
                
                // Calculate expected height
                const scale = displayWidth / this.uploaded_image.width;
                const displayHeight = this.uploaded_image.height * scale;
                
                // Resize node: Widgets + Image + Bottom Margin
                this.setSize([targetWidth, widgetHeight + displayHeight + margin + 10]);

                // Force a redraw
                this.setDirtyCanvas(true, true);
            };
        };


        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function (ctx) {
            if (onDrawForeground) onDrawForeground.apply(this, arguments);

            if (!this.uploaded_image) return;


            // This pushes the image down below the inputs
            const widgetHeight = this.getWidgetHeight();
            const margin = 10;
            const top_padding = widgetHeight; 
            
            const displayWidth = this.size[0] - (margin * 2);
            
            // Calculate scale to fit width
            const scale = displayWidth / this.uploaded_image.width;
            const displayHeight = this.uploaded_image.height * scale;

            // Store area for hit testing
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

            // 2. Draw the Interactive Crop Box
            const boxX = this.imageArea.x + (this.crop.x * scale);
            const boxY = this.imageArea.y + (this.crop.y * scale);
            const boxW = this.crop.w * scale;
            const boxH = this.crop.h * scale;

            // Fill
            ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
            ctx.fillRect(boxX, boxY, boxW, boxH);

            // Border
            ctx.strokeStyle = "#FF0000";
            ctx.lineWidth = 2;
            ctx.strokeRect(boxX, boxY, boxW, boxH);
            
            // Text Label
            ctx.fillStyle = "#FFFFFF";
            ctx.shadowColor = "black";
            ctx.shadowBlur = 4;
            ctx.font = "bold 12px Arial";
            ctx.fillText(`${Math.round(this.crop.w)}x${Math.round(this.crop.h)}`, boxX + 5, boxY + 15);

            ctx.restore();
        };


        nodeType.prototype.onMouseDown = function(e, local_pos) {
            if (!this.imageArea) return false;

            const [mx, my] = local_pos;
            const scale = this.imageArea.scale;

            const boxX = this.imageArea.x + (this.crop.x * scale);
            const boxY = this.imageArea.y + (this.crop.y * scale);
            const boxW = this.crop.w * scale;
            const boxH = this.crop.h * scale;

            // Simple rectangle hit test
            if (mx >= boxX && mx <= boxX + boxW && my >= boxY && my <= boxY + boxH) {
                this.dragState.isDragging = true;
                this.dragState.startX = mx;
                this.dragState.startY = my;
                this.dragState.initialCropX = this.crop.x;
                this.dragState.initialCropY = this.crop.y;
                return true; // Capture the event
            }
            return false;
        };

        nodeType.prototype.onMouseMove = function(e, local_pos) {

            // If the mouse button (button 0) is not held down, cancel drag.
            // This handles cases where mouseUp happened outside the node.
            if (e.buttons === 0 && this.dragState.isDragging) {
                this.dragState.isDragging = false;
                // Sync widgets one last time just in case
                if (this.widgetX) this.widgetX.value = Math.round(this.crop.x);
                if (this.widgetY) this.widgetY.value = Math.round(this.crop.y);
                return;
            }

            if (this.dragState.isDragging && this.imageArea) {
                const [mx, my] = local_pos;
                const scale = this.imageArea.scale;

                // Calculate delta in screen pixels
                const dx_screen = mx - this.dragState.startX;
                const dy_screen = my - this.dragState.startY;
                
                // Convert to image pixels
                const dx_image = dx_screen / scale;
                const dy_image = dy_screen / scale;

                let newX = this.dragState.initialCropX + dx_image;
                let newY = this.dragState.initialCropY + dy_image;


                if (newX < 0) newX = 0;
                if (newY < 0) newY = 0;
                if (newX + this.crop.w > this.uploaded_image.width) newX = this.uploaded_image.width - this.crop.w;
                if (newY + this.crop.h > this.uploaded_image.height) newY = this.uploaded_image.height - this.crop.h;

                this.crop.x = newX;
                this.crop.y = newY;

                // Redraw canvas
                this.setDirtyCanvas(true, true);
                return true;
            }
        };

        nodeType.prototype.onMouseUp = function(e, local_pos) {
            if (this.dragState.isDragging) {
                this.dragState.isDragging = false;
                
                // Update the explicit X and Y widgets instead of crop_data
                if (this.widgetX) this.widgetX.value = Math.round(this.crop.x);
                if (this.widgetY) this.widgetY.value = Math.round(this.crop.y);
                
                return true;
            }
        };
    }
});