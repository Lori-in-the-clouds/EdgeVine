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
    

def train(path_yaml,output_dir,name_dir, epochs=20, imgsz=640, batch=32,patience=10):

    #best_weights = '/Users/lorenzodimaio/Documents/Iot_project/CV/grape_counting/train_grape_640_refinement/weights/best.pt'

    # 2. Carichiamo il modello "già istruito"
    model = YOLO('yolov8n.pt')

    #model = YOLO('yolov8n.pt') 
    device = get_device()
     
    '''
    model.train(
        data=path_yaml, 
        imgsz=imgsz, 
        epochs=epochs, 
        batch=batch,
        device = device,
        project=output_dir,
        patience=patience,
        name=name_dir,
        optimizer='SGD',
        conf=0.25,    # Ignora le predizioni "deboli" (meno lavoro per NMS)
        max_det=150,  # Non processare più di 100 grappoli per foto
        iou=0.45,     # Aiuta a fondere i box sovrapposti più velocemente
        warmup_epochs=3.0,
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
    

if __name__ == '__main__':
   #train('/Users/lorenzodimaio/Documents/Iot_project/CV/grape_counting/grapes_dataset/data.yaml','/Users/lorenzodimaio/Documents/Iot_project/CV/grape_counting',epochs=20)

    train(  '/Users/lorenzodimaio/Documents/Iot_project/CV/datasets/grape-leaf-disease-dataset/data.yaml',
            output_dir = '/Users/lorenzodimaio/Documents/Iot_project/CV/leaf_disease',
            name_dir = 'train',
            epochs=100,
            batch=32,
            patience=20,
            imgsz=416
        )
