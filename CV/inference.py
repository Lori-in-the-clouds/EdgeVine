from ultralytics import YOLO
import cv2
import matplotlib.pyplot as plt
import os

DEFAULT_CAMERA_PARAMS = {
    'focal_length': 3.04,
    'sensor_width': 3.68,
    'distance': 2000
}
camera_params = DEFAULT_CAMERA_PARAMS.copy()
DEFAULT_INFERENCE_THRESHOLDS = {
    'grape_confidence': 0.30,
    'leaf_confidence': 0.35,
    'disease_threshold': 0.90,
    'stress_threshold': 0.40
}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_GRAPE_PATH = os.path.join(BASE_DIR, 'train_grape_counting', 'weights', 'best.pt')
LEAF_DISEASE_CLASSIFIER_PATH = os.path.join(BASE_DIR, 'train_leaf_disease_classifier_yolo11_large', 'weights', 'best.pt')

def normalize_camera_params(camera_params=None):
    params = DEFAULT_CAMERA_PARAMS.copy()
    params.update(camera_params or {})

    for key in ('focal_length', 'sensor_width', 'distance'):
        try:
            params[key] = float(params[key])
        except (TypeError, ValueError):
            raise ValueError(f"Camera parameter '{key}' must be numeric")

        if params[key] <= 0:
            raise ValueError(f"Camera parameter '{key}' must be greater than zero")

    return params


def normalize_confidence_threshold(value, name):
    try:
        threshold = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"Inference threshold '{name}' must be numeric")

    if not 0 <= threshold <= 1:
        raise ValueError(f"Inference threshold '{name}' must be between 0 and 1")

    return threshold


class VineyardAnalyst:
    def __init__(self, model_grape_path, model_disease_path, camera_params=None):
        """
        Analizzatore del vigneto EdgeVine.
        Implementa una pipeline a DUE STADI per l'analisi fogliare:
        - Stage 1: Rilevatore di foglie (YOLOv8-Medium) per trovare i contorni delle foglie.
        - Stage 2: Classificatore (YOLOv8-cls) per determinare lo stato di salute di ciascun ritaglio.
        """
        # Carica il modello dei Grappoli d'Uva
        self.model_grape = YOLO(model_grape_path)
        
        # STAGE 1: Rilevatore Foglie (best.pt del modello YOLOv8-Medium caricato in modo portabile)
        self.model_leaf_detector = YOLO(os.path.join(BASE_DIR, 'train_leaf_detection', 'weights', 'best.pt'))
        
        # STAGE 2: Classificatore Foglie (best.pt del classificatore addestrato sulle foglie ritagliate)
        if os.path.exists(LEAF_DISEASE_CLASSIFIER_PATH):
            self.model_leaf_classifier = YOLO(LEAF_DISEASE_CLASSIFIER_PATH)
            print("[+] Stage 2 Classifier caricato con successo dai pesi addestrati (YOLOv8-Nano)!")
        else:
            print("[*] Warning: Pesi definitivi dello Stage 2 Classifier non trovati. Carico il modello pre-addestrato yolov8n-cls.pt come fallback temporaneo.")
            self.model_leaf_classifier = YOLO('yolov8n-cls.pt')
        
        # Parametri calibrazione fotocamera
        normalized_camera_params = normalize_camera_params(camera_params)
        self.focal_length = normalized_camera_params['focal_length']
        self.sensor_width = normalized_camera_params['sensor_width']
        self.distance = normalized_camera_params['distance']
        
        # Parametri conversione vino
        self.wine_yield = 0.7  
        self.grape_density = 0.8 
        
        # Contatori interni delle foglie
        self.last_healthy_count = 0
        self.last_stress_count = 0
        self.last_disease_count = 0

    def get_pixel_to_mm_ratio(self, imgsz):
        """Calcola quanti mm rappresenta un pixel ad una determinata risoluzione"""
        width_real_mm = (self.distance * self.sensor_width) / self.focal_length
        return width_real_mm / imgsz

    def get_view_width_m(self):
        """Calcola la larghezza del campo visivo (FOV) in metri"""
        width_real_mm = (self.distance * self.sensor_width) / self.focal_length
        return width_real_mm / 1000  # Conversione in metri

    def run_inference(
        self,
        image_path,
        save_path,
        imgsz=640,
        print_prediction=True,
        grape_detection=True,
        disease_detection=True,
        grape_confidence=DEFAULT_INFERENCE_THRESHOLDS['grape_confidence'],
        leaf_confidence=DEFAULT_INFERENCE_THRESHOLDS['leaf_confidence'],
        disease_threshold=DEFAULT_INFERENCE_THRESHOLDS['disease_threshold'],
        stress_threshold=DEFAULT_INFERENCE_THRESHOLDS['stress_threshold']
    ):
        """
        Esegue l'inferenza completa: rileva i grappoli e le foglie (due stadi), 
        ritaglia le foglie in memoria, le classifica, disegna le bounding box
        sull'immagine originale e salva il risultato.
        """
        img_orig = cv2.imread(image_path)
        if img_orig is None:
            raise ValueError(f"Impossibile leggere l'immagine al percorso {image_path}")

        grape_confidence = normalize_confidence_threshold(grape_confidence, 'grape_confidence')
        leaf_confidence = normalize_confidence_threshold(leaf_confidence, 'leaf_confidence')
        disease_threshold = normalize_confidence_threshold(disease_threshold, 'disease_threshold')
        stress_threshold = normalize_confidence_threshold(stress_threshold, 'stress_threshold')
            
        h_orig, w_orig = img_orig.shape[:2]
        
        # Resetta i contatori per questa esecuzione
        self.last_healthy_count = 0
        self.last_stress_count = 0
        self.last_disease_count = 0

        # 1. RILEVAMENTO GRAPPOLI
        results1 = None
        if grape_detection:
            results1 = self.model_grape.predict(source=image_path, imgsz=imgsz, conf=grape_confidence, verbose=False)
            
        # 2. PIPELINE A DUE STADI PER LE FOGLIE
        results2 = None
        if disease_detection:
            # Stage 1: Rilevamento foglie (trova i contorni xyxy di ogni foglia)
            leaf_results = self.model_leaf_detector.predict(source=img_orig, imgsz=imgsz, conf=leaf_confidence, verbose=False)
            results2 = leaf_results
            
            # Se ci sono foglie rilevate dallo Stage 1, procediamo con il ritaglio e la classificazione Stage 2
            if len(leaf_results[0].boxes) > 0:
                for box in leaf_results[0].boxes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    
                    # Applica un padding di sicurezza di 10 pixel coerente con il training dataset
                    padding = 10
                    x1_pad = max(0, x1 - padding)
                    y1_pad = max(0, y1 - padding)
                    x2_pad = min(w_orig, x2 + padding)
                    y2_pad = min(h_orig, y2 + padding)
                    
                    # Ritaglia la foglia dall'immagine BGR originale in memoria
                    crop = img_orig[y1_pad:y2_pad, x1_pad:x2_pad]
                    if crop.size == 0:
                        continue
                        
                    # Stage 2: Classificazione della salute della singola foglia ritagliata
                    cls_results = self.model_leaf_classifier.predict(source=crop, imgsz=256, verbose=False)
                    probs = cls_results[0].probs
                    # Recupera le probabilità indipendenti per ogni classe
                    healthy_idx = [k for k, v in cls_results[0].names.items() if v == 'healthy'][0]
                    stress_idx = [k for k, v in cls_results[0].names.items() if v == 'stress'][0]
                    disease_idx = [k for k, v in cls_results[0].names.items() if v == 'disease'][0]
                    
                    prob_healthy = float(probs.data[healthy_idx])
                    prob_stress = float(probs.data[stress_idx])
                    prob_disease = float(probs.data[disease_idx])
                    
                    # Debug: Stampa le probabilità grezze estratte dall'IA per ciascuna classe
                    print(f"[DEBUG Stage 2] Leaf -> Healthy: {prob_healthy:.4f}, Stress: {prob_stress:.4f}, Disease: {prob_disease:.4f}")
                    
                    # Logica a soglie con confronto attivo e fallback su sano (healthy):
                    # 1. Controlla quali anomalie superano la propria soglia impostata dall'utente.
                    disease_passed = prob_disease >= disease_threshold
                    stress_passed = prob_stress >= stress_threshold
                    
                    # 2. Assegna la classe di conseguenza:
                    if disease_passed and stress_passed:
                        # Se entrambe superano la soglia, vince quella con probabilità grezza maggiore
                        if prob_disease >= prob_stress:
                            class_name = 'disease'
                            confidence = prob_disease
                        else:
                            class_name = 'stress'
                            confidence = prob_stress
                    elif disease_passed:
                        class_name = 'disease'
                        confidence = prob_disease
                    elif stress_passed:
                        class_name = 'stress'
                        confidence = prob_stress
                    else:
                        # Se nessuna anomalia supera la soglia, la foglia è sana
                        class_name = 'healthy'
                        confidence = prob_healthy
                    
                    # Assegna colore e contatore in base alla predizione dello Stage 2
                    if class_name == 'healthy':
                        self.last_healthy_count += 1
                        color = (0, 255, 0)      # BGR Verde (Foglia sana)
                        label_text = f"healthy {confidence:.2f}"
                    elif class_name == 'stress':
                        self.last_stress_count += 1
                        color = (0, 165, 255)    # BGR Arancione (Foglia stressata/Esca)
                        label_text = f"stress {confidence:.2f}"
                    else: # 'disease'
                        self.last_disease_count += 1
                        color = (0, 0, 255)      # BGR Rosso (Patologia fogliare)
                        label_text = f"disease {confidence:.2f}"
                        
                    # A. Disegna la bounding box classica della foglia sull'immagine originale
                    cv2.rectangle(img_orig, (x1, y1), (x2, y2), color, 3)
                    
                    # B. Crea un cartellino di sfondo solido per il testo per massimizzare la leggibilità
                    (tw, th), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
                    cv2.rectangle(img_orig, (x1, y1 - th - 10), (x1 + tw, y1), color, -1)
                    
                    # C. Scrive il testo in bianco sopra il cartellino
                    cv2.putText(img_orig, label_text, (x1, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        # Convertiamo l'immagine da BGR a RGB per gestirla con matplotlib / salvarla correttamente
        img_rgb = cv2.cvtColor(img_orig, cv2.COLOR_BGR2RGB)
        
        # 3. DISEGNO DEI GRAPPOLI (Se rilevati, sovrapposti all'immagine)
        if grape_detection and results1:
            img_combined = results1[0].plot(img=img_rgb)
        else:
            img_combined = img_rgb
            
        # Salvataggio dell'immagine finale processata
        output_dir = os.path.join(BASE_DIR, 'images')
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
            
        plt.figure(figsize=(12, 8))
        plt.imshow(img_combined)
        plt.axis('off')
        plt.tight_layout()
        plt.savefig(os.path.join(output_dir, save_path), bbox_inches='tight', pad_inches=0.1, dpi=300)
        plt.close() 
        
        if print_prediction:
            plt.show()
            
        return results1, results2

    def estimate_photo_liters(self, results_grape, imgsz, distance_override=None):
        """Stima la produzione di vino in litri per un singolo scatto"""
        if results_grape is None or len(results_grape[0].boxes) == 0:
            return 0.0
            
        dist = distance_override if distance_override is not None else self.distance
        width_real_mm = (dist * self.sensor_width) / self.focal_length
        pixel_to_mm = width_real_mm / imgsz
        
        total_grams = 0
        for box in results_grape[0].boxes:
            w_mm = box.xywh[0][2].item() * pixel_to_mm
            h_mm = box.xywh[0][3].item() * pixel_to_mm
            
            # Formula: Area * profondità (10% area) * densità grappolo
            weight_g = (w_mm * h_mm * 0.1) * self.grape_density
            total_grams += weight_g
            
        return (total_grams / 1000) * self.wine_yield

    def estimate_total_production(self, list_of_results, imgsz, total_row_length_m):
        """Stima la produzione totale del vigneto basandosi su una lista di campioni"""
        view_width_m = self.get_view_width_m()
        photo_liters = [self.estimate_photo_liters(res, imgsz) for res in list_of_results]
        
        avg_liters_per_view = sum(photo_liters) / len(photo_liters)
        liters_per_meter = avg_liters_per_view / view_width_m
        
        return liters_per_meter * total_row_length_m

    def analyze_json(
        self,
        image_path,
        save_name,
        depth_uncertainty_pct=10.0,
        total_row_meters=100,
        disease_threshold=DEFAULT_INFERENCE_THRESHOLDS['disease_threshold'],
        stress_threshold=DEFAULT_INFERENCE_THRESHOLDS['stress_threshold'],
        grape_confidence=DEFAULT_INFERENCE_THRESHOLDS['grape_confidence'],
        leaf_confidence=DEFAULT_INFERENCE_THRESHOLDS['leaf_confidence']
    ):
        """Metodo principale per la Dashboard: esegue l'analisi e ritorna un dizionario JSON"""
        res_grape, res_disease = self.run_inference(
            image_path,
            save_path=save_name,
            print_prediction=False,
            grape_confidence=grape_confidence,
            leaf_confidence=leaf_confidence,
            disease_threshold=disease_threshold,
            stress_threshold=stress_threshold
        )
        
        # Calcola i litri stimati
        liters = self.estimate_photo_liters(res_grape, 640)
        
        # Calcola i limiti di incertezza della stima di volume
        dist_min = self.distance * (1 - depth_uncertainty_pct / 100.0)
        dist_max = self.distance * (1 + depth_uncertainty_pct / 100.0)
        liters_min = self.estimate_photo_liters(res_grape, 640, distance_override=dist_min)
        liters_max = self.estimate_photo_liters(res_grape, 640, distance_override=dist_max)
        
        # Estrae i conteggi calcolati durante l'inferenza a due stadi
        leaf_healthy = getattr(self, 'last_healthy_count', 0)
        leaf_stress = getattr(self, 'last_stress_count', 0)
        leaf_disease = getattr(self, 'last_disease_count', 0)
        
        # Determina la diagnosi riassuntiva di salute
        if leaf_disease > 0:
            health_prediction = "Disease Detected"
        elif leaf_stress > 0:
            health_prediction = "Stress Detected"
        else:
            health_prediction = "Healthy"
            
        return {
            "liters_estimated": round(liters, 2),
            "liters_min": round(liters_min, 2),
            "liters_max": round(liters_max, 2),
            "health_prediction": health_prediction,
            "processed_image_url": f"/cv_results/{save_name}",
            "grape_count": len(res_grape[0].boxes) if res_grape else 0,
            "leaf_healthy_count": leaf_healthy,
            "leaf_stress_count": leaf_stress,
            "leaf_disease_count": leaf_disease
        }

if __name__ == '__main__':
    import argparse
    import json

    parser = argparse.ArgumentParser(description='Run EdgeVine vineyard computer vision inference.')
    parser.add_argument('image_path', nargs='?')
    parser.add_argument('save_name', nargs='?')
    parser.add_argument('uncertainty_pct', nargs='?', type=float, default=10.0)
    parser.add_argument('legacy_disease_threshold', nargs='?', type=float)
    parser.add_argument('--disease-threshold', type=float, default=None)
    parser.add_argument('--stress-threshold', type=float, default=DEFAULT_INFERENCE_THRESHOLDS['stress_threshold'])
    parser.add_argument('--grape-confidence', type=float, default=DEFAULT_INFERENCE_THRESHOLDS['grape_confidence'])
    parser.add_argument('--leaf-confidence', type=float, default=DEFAULT_INFERENCE_THRESHOLDS['leaf_confidence'])
    parser.add_argument('--focal-length', type=float, default=DEFAULT_CAMERA_PARAMS['focal_length'])
    parser.add_argument('--sensor-width', type=float, default=DEFAULT_CAMERA_PARAMS['sensor_width'])
    parser.add_argument('--distance', type=float, default=DEFAULT_CAMERA_PARAMS['distance'])
    args = parser.parse_args()

    configured_camera_params = {
        'focal_length': args.focal_length,
        'sensor_width': args.sensor_width,
        'distance': args.distance
    }

    # Uso via CLI per integrazione con la Dashboard web
    if args.image_path and args.save_name:
        try:
            analyst = VineyardAnalyst(MODEL_GRAPE_PATH, None, configured_camera_params)
            disease_thresh = (
                args.disease_threshold
                if args.disease_threshold is not None
                else args.legacy_disease_threshold
                if args.legacy_disease_threshold is not None
                else 0.95
            )
            result = analyst.analyze_json(
                args.image_path,
                args.save_name,
                depth_uncertainty_pct=args.uncertainty_pct,
                disease_threshold=disease_thresh,
                stress_threshold=args.stress_threshold,
                grape_confidence=args.grape_confidence,
                leaf_confidence=args.leaf_confidence
            )
            print(json.dumps(result))
        except Exception as e:
            print(json.dumps({"success": False, "error": str(e)}))
            raise SystemExit(1)
    else:
        # Esecuzione di test standalone locale
        analyst = VineyardAnalyst(MODEL_GRAPE_PATH, None, configured_camera_params)
        test_path = os.path.join(BASE_DIR, 'images', 'image copy 2.png')
        if not os.path.exists(test_path):
            test_path = os.path.join(BASE_DIR, 'image.png')
            
        if os.path.exists(test_path):
            print(f"[*] Avvio test inferenza a due stadi su: {test_path}")
            result1, result2 = analyst.run_inference(test_path, save_path='test_two_stage_result.png', print_prediction=False)
            print("[+] Test completato con successo! Risultato salvato in CV/images/test_two_stage_result.png")
            print(f"    - Healthy: {analyst.last_healthy_count}")
            print(f"    - Stress: {analyst.last_stress_count}")
            print(f"    - Disease: {analyst.last_disease_count}")
        else:
            print("Usage: python inference.py <image_path> <save_name> [uncertainty_pct] [disease_threshold] [--grape-confidence 0-1] [--leaf-confidence 0-1] [--focal-length mm] [--sensor-width mm] [--distance mm]")
