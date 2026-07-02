from flask import Flask, request, jsonify, Response, stream_with_context
import requests
import json
import urllib.parse
from duckduckgo_search import DDGS
from bs4 import BeautifulSoup
import re

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

def fetch_page_text(url, max_chars=1500):
    try:
        resp = requests.get(url, timeout=3, headers={"User-Agent": "Mozilla/5.0"})
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()
        text = " ".join(soup.stripped_strings)
        return text[:max_chars]
    except:
        return ""

def search_web(query):
    context_parts = []
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=3))
            for res in results:
                title = res.get("title", "")
                href = res.get("href", "")
                body = res.get("body", "")
                context_parts.append(f"Title: {title}\nURL: {href}\nSnippet: {body}")
        
        return "\n\n".join(context_parts)
    except:
        return ""

@app.route('/api/chat', methods=['POST'])
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
        last_user_msg = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                last_user_msg = m.get("content", "")
                break
        
        if last_user_msg:
            web_results = search_web(last_user_msg)
            if web_results:
                system_msg += f"\n\nHere are real-time web search results for the user's query to help you answer accurately:\n{web_results}\nUse this information if it is relevant."

    # Update or insert system prompt
    if messages[0].get('role') != 'system':
        messages.insert(0, {"role": "system", "content": system_msg})
    else:
        messages[0]["content"] = system_msg

    try:
        # We enforce a specific model name to help avoid OpenAI hallucination from Pollinations defaults
        resp = requests.post(
            POLLINATIONS_TEXT_API,
            json={
                "messages": messages,
                "model": "qwen", # Use Qwen on pollinations to avoid GPT-4 identity bias
                "stream": True,
                "seed": 42
            },
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
                        if decoded == "data: [DONE]":
                            break
                        try:
                            json_str = decoded[6:]
                            json_data = json.loads(json_str)
                            if "choices" in json_data and len(json_data["choices"]) > 0:
                                delta = json_data["choices"][0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    yield content
                        except Exception as e:
                            pass
                    elif not decoded.startswith(":") and not decoded.startswith("event:"):
                        yield decoded + "\n"

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
