from fastapi import FastAPI, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import uvicorn
from openai import OpenAI
from gtts import gTTS
import os
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Your Next.js frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create temp directory if it doesn't exist
os.makedirs("temp", exist_ok=True)

@app.post("/translate-audio")
async def translate_audio(
    audio: UploadFile,
    source_language: str = Form(...),
    target_language: str = Form(...)
):
    try:
        # Save uploaded file
        input_path = os.path.join("temp", f"input_{audio.filename}")
        with open(input_path, "wb") as f:
            content = await audio.read()
            f.write(content)

        # Initialize OpenAI client
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        # Step 1: Transcribe audio to text
        with open(input_path, "rb") as audio_file:
            transcript = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language=source_language
            )
        source_text = transcript.text
        print("Transcribed:", source_text)

        # Step 2: Translate text
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": f"Translate the following text from {source_language} to {target_language}."},
                {"role": "user", "content": source_text}
            ]
        )
        translated_text = response.choices[0].message.content
        print("Translated:", translated_text)

        # Step 3: Convert to speech
        output_path = os.path.join("temp", f"output_{audio.filename}.mp3")
        tts = gTTS(text=translated_text, lang=target_language)
        tts.save(output_path)

        # Return the audio file
        return FileResponse(
            output_path,
            media_type="audio/mpeg",
            headers={
                "source-text": source_text,
                "translated-text": translated_text
            }
        )

    except Exception as e:
        print("Error:", str(e))
        return {"error": str(e)}

    finally:
        # Clean up files
        try:
            os.remove(input_path)
            os.remove(output_path)
        except:
            pass

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000) 