from flask import Flask, request, jsonify, Response, stream_with_context
import requests
import json
import urllib.parse

app = Flask(__name__)

# Pollinations API is a free, unauthenticated AI API.
POLLINATIONS_TEXT_API = "https://text.pollinations.ai/"
POLLINATIONS_IMAGE_API = "https://image.pollinations.ai/prompt/"

def get_system_prompt():
    return """You are an advanced AI assistant created to be extremely helpful, fast, and polite.
CRITICAL RULES:
1. Always respond in the EXACT SAME LANGUAGE the user writes in. If the user writes in Uzbek, you MUST reply in fluent, native Uzbek.
2. If the user asks you to generate, draw, or show an image, you MUST output exactly this special format on a new line: [IMAGE: prompt here]. 
   Example: [IMAGE: a futuristic city with flying cars]
   Do not explain the image generation, just output the tag.
3. Be concise and precise. Use Markdown formatting.
4. You don't require any API keys to work.
"""

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    messages = data.get('messages', [])
    
    if not messages:
        return jsonify({"error": "No messages provided"}), 400

    # Ensure system prompt is the first message
    if messages[0].get('role') != 'system':
        messages.insert(0, {"role": "system", "content": get_system_prompt()})
    else:
        messages[0]["content"] = get_system_prompt()

    try:
        # We stream the response from Pollinations AI
        resp = requests.post(
            POLLINATIONS_TEXT_API,
            json={
                "messages": messages,
                "model": "openai", # This routes to a fast, powerful model automatically
                "stream": True
            },
            stream=True,
            timeout=30
        )
        
        if resp.status_code != 200:
            return jsonify({"error": f"API error {resp.status_code}"}), 500

        def generate():
            for chunk in resp.iter_lines():
                if chunk:
                    # Pollinations sends raw text chunks or SSE depending on format, 
                    # usually it's SSE if stream=True
                    decoded = chunk.decode('utf-8')
                    if decoded == "data: [DONE]":
                        break
                    yield decoded + "\n"

        return Response(stream_with_context(generate()), mimetype='text/event-stream')
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/image', methods=['GET'])
def get_image():
    prompt = request.args.get('prompt', '')
    if not prompt:
        return jsonify({"error": "No prompt provided"}), 400
    
    # We just return the direct URL to the pollinations image service
    # so the frontend can render it directly.
    encoded_prompt = urllib.parse.quote(prompt)
    image_url = f"{POLLINATIONS_IMAGE_API}{encoded_prompt}?width=800&height=800&nologo=true"
    
    return jsonify({"url": image_url})

# Vercel needs the app variable to be exposed
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
