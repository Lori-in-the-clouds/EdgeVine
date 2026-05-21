from ultralytics import YOLO
import torch
import os

def get_device():
    """
    Rileva automaticamente l'hardware disponibile per accelerare il calcolo (CUDA, MPS o CPU).
    """
    if torch.cuda.is_available():
        device = torch.device("cuda")  
    elif torch.backends.mps.is_available():
        device = torch.device("mps")
    else:
        device = torch.device("cpu")
    print(f"[*] Hardware rilevato ed in uso: {device}")
    return device 

def train_stage1_detector(path_yaml, output_dir, name_dir, epochs=150, imgsz=512, batch=32, patience=30):
    """
    STAGE 1: Addestra il rilevatore di foglie (YOLOv8-Medium) per localizzare le foglie nel vigneto.
    """
    device = get_device()
    model = YOLO('yolo26m.pt') # Rete Medium a 26 strati per massimizzare la precisione

    model.train(
        data=path_yaml, 
        imgsz=imgsz,           
        epochs=epochs,        
        batch=batch,            
        patience=patience,       
        device=device,
        project=output_dir,
        name=name_dir,
        optimizer='AdamW', 
        lr0=0.001,           
        cos_lr=True,         
        label_smoothing=0.1, 
        warmup_epochs=3.0,   
        close_mosaic=15,     
        max_det=50,          
        workers=4,           
        cache=True,          
        plots=True           
    )

def train_stage2_classifier(dataset_dir, epochs=50, batch=32, imgsz=224):
    """
    STAGE 2: Addestra il classificatore di salute fogliare (YOLOv8-cls Nano).
    Prende in input i ritagli delle singole foglie e le classifica in:
    - sana (healthy)
    - stressata (stress)
    - malata (disease)
    """
    device = get_device()
    
    # Verifica che il percorso del dataset esista
    if not os.path.exists(dataset_dir):
        print(f"[!] Errore: Cartella dataset non trovata in: {dataset_dir}")
        print("[!] Verifica di aver estratto lo zip di Roboflow in quel percorso.")
        return
        
    print("\n" + "="*50)
    print("🚀 AVVIO TRAINING STAGE 2: CLASSIFICATORE FOGLIE 🚀")
    print("="*50)
    print(f"[*] Posizione Dataset: {dataset_dir}")
    print(f"[*] Epoche: {epochs} | Batch Size: {batch} | Dimensione Immagini: {imgsz}x{imgsz}")
    print("="*50 + "\n")
    
    # Inizializziamo il modello YOLOv8 Classify Nano (leggerissimo e ultra-preciso)
    model = YOLO('yolov8n-cls.pt')
    
    # Avviamo l'addestramento ottimizzato su Apple Silicon (MPS)
    model.train(
        data=dataset_dir,
        epochs=epochs,
        batch=batch,
        imgsz=imgsz,
        device=device,
        project='/Users/lorenzodimaio/Documents/Iot_project/CV',
        name='train_leaf_disease_classifier',
        optimizer='AdamW',
        cos_lr=True,
        lr0=0.001,
        workers=0  # Impostato a 0 per evitare deadlock e bug di multiprocessing su macOS MPS
    )
    
    print("\n" + "="*50)
    print("✨ STAGE 2 CLASSIFIER TRAINING COMPLETATO ✨")
    print("="*50 + "\n")

if __name__ == '__main__':
    
    
    #import wandb
    #wandb.init(entity="edgevine-lorenzo", project="EdgeVine-Leaf-Detector", resume=True)



    # Utilizziamo YOLO11-Large (yolo11l-cls) per avere la massima capacità di astrazione,
    # cogliere pattern finissimi (come ingiallimenti precoci del Mal dell'Esca)
    # ed evitare falsi positivi in condizioni outdoor reali.
    model = YOLO('yolo11l-cls.pt')
    
    model.train(
        data='/Users/lorenzodimaio/Documents/Iot_project/CV/dataset_classificazione',
        epochs=80,         # Aumentato a 80 epoche per far convergere perfettamente il modello Large
        batch=32,          # Ottimale per stabilità del gradiente e GPU Mac
        imgsz=256,         # Aumentato a 256 per dare più dettagli spaziali all'IA sui particolari
        device='mps',      # GPU Apple Silicon attiva
        project='/Users/lorenzodimaio/Documents/Iot_project/CV',
        name='train_leaf_disease_classifier_yolo11_large',
        optimizer='AdamW',
        cos_lr=True,
        lr0=0.001,
        patience=15,       # Interrompe l'addestramento se l'accuratezza di validazione non migliora per 15 epoche
        label_smoothing=0.1, # Regolarizzazione fondamentale per evitare overfitting e generalizzare meglio
        workers=4,         # 0 per prevenire deadlock su macOS MPS
        plots=True,
        # --- STRATEGIA DI AUGMENTATION PER CONDIZIONI OUTDOOR ESTREME ---
        degrees=45.0,      # Ruota le foglie per essere robusto a qualsiasi inclinazione
        translate=0.15,    # Sposta l'immagine per gestire ritagli non perfettamente centrati
        scale=0.2,         # Varia la scala per simulare foglie a distanze diverse
        hsv_h=0.03,        # Cambia tonalità di verde (foglie giovani, vecchie, illuminate)
        hsv_s=0.8,         # Cambia la saturazione (foglie secche, bagnate o con riflessi)
        hsv_v=0.6,         # Cambia la luminosità (CRITICO per ombre profonde e sole battente)
        flipud=0.5,        # Flip verticali
        fliplr=0.5,        # Flip orizzontali
        mixup=0.15         # Mescola immagini per gestire foglie sovrapposte ed erba sullo sfondo
    )


    # ---------------------------------------------------------------------
    # OPZIONE B: RIPRENDERE IL TRAINING DETECTOR STAGE 1 (Già completato)
    # ---------------------------------------------------------------------
    # import wandb
    # wandb.init(entity="edgevine-lorenzo", project="EdgeVine-Leaf-Detector", resume=True)
    # model = YOLO('/Users/lorenzodimaio/Documents/Iot_project/CV/train_foglie_yolo26_medium2/weights/last.pt')
    # model.train(resume=True)
