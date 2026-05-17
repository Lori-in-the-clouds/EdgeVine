from ultralytics import YOLO
import cv2
import matplotlib.pyplot as plt
import os

camera_params = {
    'focal_length': 3.04,
    'sensor_width': 3.68,
    'distance': 2000
    
}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_GRAPE_PATH=os.path.join(BASE_DIR, 'train_grape_counting', 'weights', 'best.pt')
MODEL_DISEASE_PATH = os.path.join(BASE_DIR, 'train_leaf_disease', 'weights', 'best.pt')

class VineyardAnalyst:
    def __init__(self, model_grape_path, model_disease_path, camera_params):
        
        self.model_grape_path = YOLO(model_grape_path)
        self.model_disease_path = YOLO(model_disease_path)
        
        # Camera Calibration Parameters
        self.focal_length = camera_params['focal_length']
        self.sensor_width = camera_params['sensor_width']
        self.distance = camera_params['distance']
        
        # Wine Conversion Factors
        self.wine_yield = 0.7  # WINE_YIELD_RATIO
        self.grape_density = 0.8 # GRAPE_DENSITY

    def get_pixel_to_mm_ratio(self, imgsz):
        """Calculates how many mm one pixel represents at a specific resolution"""
        width_real_mm = (self.distance * self.sensor_width) / self.focal_length
        return width_real_mm / imgsz

    def get_view_width_m(self):
        """"Calculates the horizontal field of view (FOV) in meters"""
        width_real_mm = (self.distance * self.sensor_width) / self.focal_length
        return width_real_mm / 1000  # Conversion in meters

    def run_inference(self, image_path, save_path, imgsz=640, print_prediction = True, grape_detection=True, disease_detection=True):
        img_orig = cv2.imread(image_path)
        if img_orig is None:
            raise ValueError(f"Could not read image at {image_path}")
            
        img_combined = cv2.cvtColor(img_orig, cv2.COLOR_BGR2RGB)

        results1,results2 = None,None

        if grape_detection:
            results1 = self.model_grape_path.predict(source=image_path, imgsz=imgsz, conf=0.25, verbose=False)
            img_combined = results1[0].plot(img=img_combined)
            
        if disease_detection:
            results2 = self.model_disease_path.predict(source=image_path, imgsz=imgsz, conf=0.25, verbose=False)
            img_combined = results2[0].plot(img=img_combined)
            
        output_dir = os.path.join(BASE_DIR, 'images')
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

        plt.figure(figsize=(12, 8))
        plt.imshow(img_combined)
        plt.axis('off')
        plt.tight_layout()
        plt.savefig(os.path.join(output_dir, save_path), bbox_inches='tight', pad_inches=0.1, dpi=300)
        plt.close() # Close to avoid memory leak
        
        if print_prediction:
            plt.show()

        return results1,results2

    def estimate_photo_liters(self, results_grape, imgsz, distance_override=None):
        """Estimates wine production (liters) for a single frame"""
        dist = distance_override if distance_override is not None else self.distance
        width_real_mm = (dist * self.sensor_width) / self.focal_length
        pixel_to_mm = width_real_mm / imgsz
        
        total_grams = 0
        
        for box in results_grape[0].boxes:
            # xywh[0][2] è la larghezza, [0][3] è l'altezza
            w_mm = box.xywh[0][2].item() * pixel_to_mm
            h_mm = box.xywh[0][3].item() * pixel_to_mm
            
            # Formula: Area * profondità (10% area) * densità
            weight_g = (w_mm * h_mm * 0.1) * self.grape_density
            total_grams += weight_g
            
        return (total_grams / 1000) * self.wine_yield

    def estimate_total_production(self, list_of_results, imgsz, total_row_length_m):
        """Estimates total vineyard production based on a list of samples"""
        #total_row_length_m -> it represents the sum of the lengths of all the rows in the vineyard
        view_width_m = self.get_view_width_m()
        photo_liters = [self.estimate_photo_liters(res, imgsz) for res in list_of_results]
        
        avg_liters_per_view = sum(photo_liters) / len(photo_liters)
        liters_per_meter = avg_liters_per_view / view_width_m
        
        return liters_per_meter * total_row_length_m


    def analyze_json(self, image_path, save_name, depth_uncertainty_pct=10.0, total_row_meters=100):
        """Helper for the Dashboard: runs inference and returns a JSON-serializable dict"""
        res_grape, res_disease = self.run_inference(image_path, save_path=save_name, print_prediction=False)
        
        # Calculate liters for this specific photo
        liters = self.estimate_photo_liters(res_grape, 640)
        
        # Calculate uncertainty bounds
        dist_min = self.distance * (1 - depth_uncertainty_pct / 100.0)
        dist_max = self.distance * (1 + depth_uncertainty_pct / 100.0)
        liters_min = self.estimate_photo_liters(res_grape, 640, distance_override=dist_min)
        liters_max = self.estimate_photo_liters(res_grape, 640, distance_override=dist_max)
        
        # Calculate leaf health counts
        leaf_healthy = 0
        leaf_stress = 0
        leaf_disease = 0
        
        if res_disease and len(res_disease[0].boxes) > 0:
            for box in res_disease[0].boxes:
                label = res_disease[0].names[int(box.cls[0])]
                if label == "Healthy":
                    leaf_healthy += 1
                elif label == "Stress":
                    leaf_stress += 1
                else:
                    leaf_disease += 1
        
        return {
            "liters_estimated": round(liters, 2),
            "liters_min": round(liters_min, 2),
            "liters_max": round(liters_max, 2),
            "health_prediction": "Healthy" if leaf_disease == 0 and leaf_stress == 0 else "Disease Detected" if leaf_disease > 0 else "Stress Detected",
            "processed_image_url": f"/cv_results/{save_name}",
            "grape_count": len(res_grape[0].boxes) if res_grape else 0,
            "leaf_healthy_count": leaf_healthy,
            "leaf_stress_count": leaf_stress,
            "leaf_disease_count": leaf_disease
        }

if __name__ == '__main__':
    import sys
    import json
    
    # Redefine analyst with verbose=False to be sure
    analyst = VineyardAnalyst(MODEL_GRAPE_PATH, MODEL_DISEASE_PATH, camera_params)
    
    # CLI usage: python3 inference.py <image_path> <save_name> [uncertainty_pct]
    if len(sys.argv) > 2:
        try:
            img_path = sys.argv[1]
            out_name = sys.argv[2]
            uncertainty = float(sys.argv[3]) if len(sys.argv) > 3 else 10.0
            result = analyst.analyze_json(img_path, out_name, depth_uncertainty_pct=uncertainty)
            # Ensure only the JSON is printed to stdout
            print(json.dumps(result))
        except Exception as e:
            print(json.dumps({"success": False, "error": str(e)}))
            sys.exit(1)
    else:
        # Default test
        test_path = os.path.join(BASE_DIR, 'image.png')
        if os.path.exists(test_path):
            result1, result2 = analyst.run_inference(test_path, save_path='test_result.png', print_prediction=False)
            print(f"Test complete. Liters: {analyst.estimate_photo_liters(result1, 640)}")
        else:
            print("Usage: python inference.py <image_path> <save_name> [uncertainty_pct]")

    
    
                        
