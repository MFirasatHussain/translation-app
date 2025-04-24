import os
from fastapi import FastAPI, UploadFile, Form, Response
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from gtts import gTTS
import tempfile
from dotenv import load_dotenv
import httpx
import base64

load_dotenv()

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["source-text", "translated-text", "source-text-base64", "translated-text-base64"]  # Expose custom headers
)

# Initialize OpenAI client with custom httpx client
http_client = httpx.Client()
client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    http_client=http_client
)

@app.post("/translate-audio")
async def translate_audio(
    audio: UploadFile,
    source_language: str = Form(...),
    target_language: str = Form(...)
):
    temp_audio = None
    temp_translated = None
    try:
        # Save the uploaded audio to a temporary file
        content = await audio.read()
        temp_audio = tempfile.NamedTemporaryFile(delete=False, suffix=".webm")
        temp_audio.write(content)
        temp_audio.flush()
        temp_audio.close()  # Close the file after writing
        
        # Transcribe the audio using OpenAI Whisper
        with open(temp_audio.name, "rb") as audio_file:
            transcript = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language=source_language
            )
            
        transcribed_text = transcript.text

        # Translate the transcribed text using OpenAI
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": f"You are a translator. Translate the following text from {source_language} to {target_language}. Provide only the translation, no explanations."},
                {"role": "user", "content": transcribed_text}
            ]
        )
        
        translated_text = response.choices[0].message.content

        # Convert translated text to speech using gTTS
        tts = gTTS(text=translated_text, lang=target_language)
        
        # Save the translated audio to a temporary file
        temp_translated = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
        tts.save(temp_translated.name)
        temp_translated.close()  # Close the file after saving
        
        # Read the translated audio file
        with open(temp_translated.name, "rb") as translated_file:
            translated_audio = translated_file.read()

        # Base64 encode the text values
        source_text_b64 = base64.b64encode(transcribed_text.encode('utf-8')).decode('ascii')
        translated_text_b64 = base64.b64encode(translated_text.encode('utf-8')).decode('ascii')

        # Create response headers with base64 encoded text
        headers = {
            "Content-Type": "audio/mpeg",
            "Access-Control-Allow-Origin": "http://localhost:3000",
            "Access-Control-Expose-Headers": "source-text-base64, translated-text-base64",
            "source-text-base64": source_text_b64,
            "translated-text-base64": translated_text_b64
        }

        return Response(content=translated_audio, headers=headers)

    except Exception as e:
        print(f"Error in translate_audio: {str(e)}")
        raise

    finally:
        # Clean up temporary files
        try:
            if temp_audio and os.path.exists(temp_audio.name):
                os.unlink(temp_audio.name)
            if temp_translated and os.path.exists(temp_translated.name):
                os.unlink(temp_translated.name)
        except Exception as e:
            print(f"Error cleaning up temporary files: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 