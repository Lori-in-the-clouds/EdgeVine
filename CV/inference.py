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
        img_combined = cv2.cvtColor(img_orig, cv2.COLOR_BGR2RGB)

        results1,results2 = None,None

        if grape_detection:
            model1 = YOLO(self.model_grape_path)
            results1 = model1.predict(source=image_path, imgsz=imgsz, conf=0.25, verbose=False)
            img_combined = results1[0].plot(img=img_combined)
            
        if disease_detection:
            model2 = YOLO(self.model_disease_path)
            results2 = model2.predict(source=image_path, imgsz=imgsz, conf=0.25, verbose=False)
            img_combined = results2[0].plot(img=img_combined)
            
        output_dir = 'images'
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

        plt.figure(figsize=(12, 8))
        plt.imshow(img_combined)
        plt.axis('off')
        plt.tight_layout()
        plt.savefig(f"{output_dir}/{save_path}", bbox_inches='tight', pad_inches=0.1, dpi=300)
        if print_prediction:
            plt.show()

        return results1,results2

    def estimate_photo_liters(self, results_grape, imgsz):
        """Estimates wine production (liters) for a single frame"""
        pixel_to_mm = self.get_pixel_to_mm_ratio(imgsz)
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


if __name__ == '__main__':
    analyst = VineyardAnalyst(MODEL_GRAPE_PATH, MODEL_DISEASE_PATH,camera_params)
    result1, result2 = analyst.run_inference('/Users/lorenzodimaio/Documents/Iot_project/CV/image.png',
                            print_prediction = False, 
                            grape_detection=True, 
                            disease_detection=True,
                            save_path='result1.png'
                        )
    print(analyst.estimate_total_production([result1],640,100))

    
    
                        
