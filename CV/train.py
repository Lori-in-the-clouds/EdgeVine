from ultralytics import YOLO
import torch

def get_device():
    
    if torch.cuda.is_available():
        device = torch.device("cuda")  
        
    elif torch.backends.mps.is_available():
        device = torch.device("mps")
    
    else:
        device = torch.device("cpu")
    
    print(f"Using device: {device}")
    return device 
    
def export(model,file_yaml,imgsz=320):
    model.export(
        format='tflite', 
        int8=True, 
        data=file_yaml,
        imgsz=imgsz
    )
    

def train(path_yaml,output_dir,name_dir, epochs=150, imgsz=512, batch=32,patience=30):

    #best_weights = '/Users/lorenzodimaio/Documents/Iot_project/CV/grape_counting/train_grape_640_refinement/weights/best.pt'

    # 2. Carichiamo il modello "già istruito"
    model = YOLO('yolov8n.pt')

    #model = YOLO('yolov8n.pt') 
    device = get_device()
     
    
    '''
    model.train(
        data=path_yaml, 
        imgsz=imgsz,     
        epochs=150,        
        batch=batch,       
        patience=patience,       
        device=device,
        project=output_dir,
        name=name_dir,
        optimizer='AdamW', 
        lr0=0.001,        
        cos_lr=True,      
        label_smoothing=0.1, 
        overlap_mask=True, 
        cache=True,
        max_det=100
        )
    '''

    model.train(
        data=path_yaml, 
        imgsz=512,           # Risoluzione ottimale per dettagli fogliari
        epochs=150,        
        batch=32,            # Stabilità per chip M4 Pro
        patience=30,       
        device=device,
        project=output_dir,
        name=name_dir,
        optimizer='AdamW', 
        lr0=0.001,           # Learning rate iniziale leggermente più basso per stabilità
        cos_lr=True,         # Decadimento fluido del learning rate
        label_smoothing=0.1, # Aiuta a gestire l'incertezza tra classi di malattie
        warmup_epochs=3.0,   # "Riscaldamento" iniziale per stabilizzare i gradienti
        close_mosaic=20,     # Disattiva mosaic alla fine per migliorare la precisione
        max_det=50,          # Riduce il carico NMS (evita il warning sul Mac)
        workers=4,           # Gestione ottimale della memoria unificata
        cache=True,          # Accelera il training caricando in RAM
        plots=True           # Genera i grafici per la tua tesi
    )


if __name__ == '__main__':
    
    #train('/Users/lorenzodimaio/Documents/Iot_project/CV/datasets/grape-leaf-disease_dataset/data.yaml','/Users/lorenzodimaio/Documents/Iot_project/CV/','train_nuovo')
    # Carica l'ultimo check-point salvato
    #model = YOLO('/Users/lorenzodimaio/Documents/Iot_project/CV/leaf_disease/train/weights/last.pt')

    # Riprendi il training
    # model.train(resume=True,batch=16)
    # 1. Carica l'ultimo checkpoint salvato (last.pt)
   

    # 1. Carica i pesi dell'ultimo salvataggio, ma NON usare resume=True
    #model = YOLO('/Users/lorenzodimaio/Documents/Iot_project/CV/train_nuovo/weights/last.pt')

    '''
    # 2. Fai partire un NUOVO training usando quei pesi come base
    model.train(
        data='/Users/lorenzodimaio/Documents/Iot_project/CV/datasets/grape-leaf-disease_dataset/data.yaml',
        epochs=100,         # Definiamo nuove epoche
        imgsz=512,
        batch=16,
        patience=50,        # Alziamo un po' la pazienza per evitare stop immediati
        mosaic=1.0,         # Fondamentale per il problema del background!
        mixup=0.2,          # Aiuta a distinguere foglie sovrapposte
        device='mps',       # Forza l'uso del tuo chip M4 Pro
        name='train_foglie_extra' # Cambia nome per non sovrascrivere
    )
    '''
    model = YOLO('runs/detect/train_foglie_extra/weights/last.pt')
    model.train(resume=True, patience=0)



    

    
