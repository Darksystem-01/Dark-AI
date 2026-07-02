from flask import Flask, request, jsonify, Response, stream_with_context
import requests
import json
import urllib.parse

app = Flask(__name__)

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
"""

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    messages = data.get('messages', [])
    
    if not messages:
        return jsonify({"error": "No messages provided"}), 400

    if messages[0].get('role') != 'system':
        messages.insert(0, {"role": "system", "content": get_system_prompt()})
    else:
        messages[0]["content"] = get_system_prompt()

    try:
        resp = requests.post(
            POLLINATIONS_TEXT_API,
            json={
                "messages": messages,
                "model": "openai", 
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
                    decoded = chunk.decode('utf-8').strip()
                    
                    # If it's an SSE format data line
                    if decoded.startswith("data: "):
                        if decoded == "data: [DONE]":
                            break
                        try:
                            # Extract the JSON part after 'data: '
                            json_str = decoded[6:]
                            json_data = json.loads(json_str)
                            
                            # Parse content based on standard OpenAI stream format
                            if "choices" in json_data and len(json_data["choices"]) > 0:
                                delta = json_data["choices"][0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    yield content
                        except Exception as e:
                            pass
                    # If the API falls back to raw text streaming (not SSE)
                    elif not decoded.startswith(":") and not decoded.startswith("event:"):
                        # Sometimes APIs return raw text chunks if SSE fails
                        yield decoded + "\n"

        # Return as plain text stream instead of SSE
        return Response(stream_with_context(generate()), mimetype='text/plain')
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/image', methods=['GET'])
def get_image():
    prompt = request.args.get('prompt', '')
    if not prompt:
        return jsonify({"error": "No prompt provided"}), 400
    
    encoded_prompt = urllib.parse.quote(prompt)
    image_url = f"{POLLINATIONS_IMAGE_API}{encoded_prompt}?width=800&height=800&nologo=true"
    
    return jsonify({"url": image_url})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
