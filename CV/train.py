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
        imgsz=imgsz, 
        epochs=epochs, 
        batch=batch,
        device=device,
        project=output_dir,
        patience=patience,
        name=name_dir,
        optimizer='AdamW', 
        lr0=0.01,
        cos_lr=True,        
        warmup_epochs=3.0,
        conf=0.25,      # Alza un po' la confidenza minima per la validazione
        max_det=100,   # Limita a 100 oggetti per immagine
        iou=0.45,
        cache=True        
    )
    '''
    

if __name__ == '__main__':
   #train('/Users/lorenzodimaio/Documents/Iot_project/CV/grape_counting/grapes_dataset/data.yaml','/Users/lorenzodimaio/Documents/Iot_project/CV/grape_counting',epochs=20)

    #train('/Users/lorenzodimaio/Documents/Iot_project/CV/datasets/grape_sum/data.yaml',output_dir = '/Users/lorenzodimaio/Documents/Iot_project/CV/leaf_disease',name_dir = 'train',)
    
    # Carica l'ultimo check-point salvato
    model = YOLO('/Users/lorenzodimaio/Documents/Iot_project/CV/leaf_disease/train/weights/last.pt')

    # Riprendi il training
    model.train(resume=True,batch=16)


    

    
