from flask import Flask, request, jsonify, Response, stream_with_context
import requests
import json
import urllib.parse
from bs4 import BeautifulSoup

app = Flask(__name__)

POLLINATIONS_TEXT_API = "https://text.pollinations.ai/"
POLLINATIONS_IMAGE_API = "https://image.pollinations.ai/prompt/"

def get_system_prompt():
    return """You are Dark AI, an advanced AI assistant created exclusively by Darksystem.
CRITICAL IDENTITY RULES:
1. You are created by Darksystem.
2. The owner and creator of you is Darksystem.
3. NEVER mention OpenAI, GPT, ChatGPT, Claude, Anthropic, or any other company/model. If asked what model you are, you are Dark AI, built by Darksystem.
4. If asked who created you, say: "Men Darksystem tomonidan yaratilganman." (I am created by Darksystem).

CRITICAL BEHAVIOR RULES:
1. Always respond in the EXACT SAME LANGUAGE the user writes in. If the user writes in Uzbek, you MUST reply in fluent, native Uzbek.
2. If the user asks you to generate, draw, or show an image, you MUST output exactly this special format on a new line: [IMAGE: prompt here]. 
   Example: [IMAGE: a futuristic city with flying cars]
   Do not explain the image generation, just output the tag.
3. Be concise and precise. Use Markdown formatting.
"""

def get_deepthink_prompt():
    return """You are in DeepThink mode. Before providing the final answer, you must think through the problem step-by-step in detail.
Think deeply about the implications, explore different angles, and provide a comprehensive, highly-detailed, and professional answer.
Your goal is maximum accuracy, logic, and depth. Provide a long, well-reasoned response.
"""

def search_web(query):
    context_parts = []
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        url = f"https://www.bing.com/search?q={urllib.parse.quote(query)}"
        resp = requests.get(url, headers=headers, timeout=5)
        soup = BeautifulSoup(resp.text, "html.parser")
        
        for li in soup.find_all('li', class_='b_algo', limit=3):
            title = li.find('h2')
            snippet = li.find('p')
            if title and snippet:
                context_parts.append(f"Title: {title.text.strip()}\nSnippet: {snippet.text.strip()}")
        return "\n\n".join(context_parts)
    except Exception:
        return ""

@app.route('/api/chat', methods=['POST'])
@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    messages = data.get('messages', [])
    use_search = data.get('use_search', False)
    use_deepthink = data.get('use_deepthink', False)
    
    if not messages:
        return jsonify({"error": "No messages provided"}), 400

    system_msg = get_system_prompt()
    
    if use_deepthink:
        system_msg += "\n" + get_deepthink_prompt()

    if use_search:
        last_user_msg = next((m.get("content", "") for m in reversed(messages) if m.get("role") == "user"), "")
        if last_user_msg:
            web_results = search_web(last_user_msg)
            if web_results:
                system_msg += f"\n\nHere are real-time web search results for the user's query to help you answer accurately:\n{web_results}"

    if messages[0].get('role') != 'system':
        messages.insert(0, {"role": "system", "content": system_msg})
    else:
        messages[0]["content"] = system_msg

    try:
        resp = requests.post(
            POLLINATIONS_TEXT_API,
            json={"messages": messages, "stream": True, "seed": 42},
            stream=True,
            timeout=40
        )
        
        if resp.status_code != 200:
            return jsonify({"error": f"API error {resp.status_code}"}), 500

        def generate():
            for chunk in resp.iter_lines():
                if chunk:
                    decoded = chunk.decode('utf-8').strip()
                    if decoded.startswith("data: "):
                        if decoded == "data: [DONE]": break
                        try:
                            json_data = json.loads(decoded[6:])
                            if "choices" in json_data and len(json_data["choices"]) > 0:
                                content = json_data["choices"][0].get("delta", {}).get("content", "")
                                if content:
                                    # Qat'iy OpenAI filtratsiyasi
                                    content = content.replace("OpenAI", "Darksystem").replace("ChatGPT", "Dark AI").replace("GPT-4", "Dark AI").replace("GPT-3", "Dark AI").replace("GPT", "Dark AI").replace("openai", "darksystem").replace("chatgpt", "dark ai")
                                    yield content
                        except Exception:
                            pass
                    elif not decoded.startswith(":") and not decoded.startswith("event:"):
                        decoded = decoded.replace("OpenAI", "Darksystem").replace("ChatGPT", "Dark AI").replace("GPT-4", "Dark AI").replace("GPT", "Dark AI")
                        yield decoded + "\n"

        return Response(stream_with_context(generate()), mimetype='text/plain')
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/image', methods=['GET'])
@app.route('/image', methods=['GET'])
def get_image():
    prompt = request.args.get('prompt', '')
    if not prompt:
        return jsonify({"error": "No prompt provided"}), 400
    return jsonify({"url": f"{POLLINATIONS_IMAGE_API}{urllib.parse.quote(prompt)}?width=800&height=800&nologo=true"})

@app.route('/', defaults={'path': ''}, methods=['GET', 'POST'])
@app.route('/<path:path>', methods=['GET', 'POST'])
def catch_all(path):
    return jsonify({"status": "Backend Active", "path": path})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
