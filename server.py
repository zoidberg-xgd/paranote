#!/usr/bin/env python3
"""
ParaNote Python Server - 段落评论 API
等效于 Node.js 版本的 server.js

API:
  GET  /api/v1/comments?siteId=&workId=&chapterId=
  POST /api/v1/comments
  POST /api/v1/comments/like
  DELETE /api/v1/comments
  GET  /api/v1/fetch?url=&mode=reader|raw
  GET  /api/v1/export
  POST /api/v1/import
"""

import os
import json
import hashlib
import hmac
import base64
import uuid
import re
import urllib.parse
from datetime import datetime
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

import httpx
from readability import Document
from bs4 import BeautifulSoup

# 添加 browserforge 路径
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / 'browserforge'))

try:
    from browserforge.headers import HeaderGenerator
    HEADER_GEN = HeaderGenerator(
        browser=('chrome', 'firefox', 'edge'),
        os=('windows', 'macos'),
        device='desktop',
        locale=('zh-CN', 'zh', 'en-US'),
        http_version=1  # 使用 HTTP/1.1 避免 h2 依赖
    )
    print("BrowserForge loaded successfully")
except ImportError as e:
    print(f"BrowserForge not available: {e}")
    HEADER_GEN = None

# 配置
PORT = int(os.environ.get('PORT', 4000))
DATA_DIR = Path(__file__).parent / 'data'
PUBLIC_DIR = Path(__file__).parent / 'public'
ADMIN_SECRET = os.environ.get('ADMIN_SECRET', '')

# 部署模式: full (完整前端+API), api (仅API), reader (API+阅读器)
DEPLOY_MODE = os.environ.get('DEPLOY_MODE', 'full').lower()
# full   = 完整部署 (首页 + 阅读器 + 所有API)
# api    = 仅核心API (评论CRUD，不含 /api/v1/fetch)
# reader = API + 阅读器 (含 /api/v1/fetch，但无首页)

# 解析 SITE_SECRETS
try:
    SITE_SECRETS = json.loads(os.environ.get('SITE_SECRETS', '{}'))
except:
    SITE_SECRETS = {}


# ==================== 存储层 ====================

def get_file_path(site_id: str, work_id: str, chapter_id: str) -> Path:
    safe_name = f"{urllib.parse.quote(site_id, safe='')}__{urllib.parse.quote(work_id, safe='')}__{urllib.parse.quote(chapter_id, safe='')}.json"
    return DATA_DIR / safe_name


def read_all(site_id: str, work_id: str, chapter_id: str) -> list:
    file_path = get_file_path(site_id, work_id, chapter_id)
    try:
        return json.loads(file_path.read_text(encoding='utf-8'))
    except:
        return []


def write_all(site_id: str, work_id: str, chapter_id: str, comments: list):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    file_path = get_file_path(site_id, work_id, chapter_id)
    file_path.write_text(json.dumps(comments, ensure_ascii=False), encoding='utf-8')


def list_comments(site_id: str, work_id: str, chapter_id: str) -> dict:
    all_comments = read_all(site_id, work_id, chapter_id)
    # 按热度排序
    all_comments.sort(key=lambda c: (-(c.get('likes', 0)), c.get('createdAt', '')), reverse=False)
    all_comments.sort(key=lambda c: -(c.get('likes', 0)))
    
    grouped = {}
    for c in all_comments:
        key = str(c.get('paraIndex', 0))
        if key not in grouped:
            grouped[key] = []
        grouped[key].append(c)
    return grouped


def create_comment(data: dict) -> dict:
    site_id = data['siteId']
    work_id = data['workId']
    chapter_id = data['chapterId']
    
    all_comments = read_all(site_id, work_id, chapter_id)
    
    comment = {
        'id': str(uuid.uuid4()),
        **data,
        'likes': 0,
        'createdAt': datetime.utcnow().isoformat() + 'Z'
    }
    
    all_comments.append(comment)
    write_all(site_id, work_id, chapter_id, all_comments)
    return comment


def like_comment(site_id: str, work_id: str, chapter_id: str, comment_id: str, user_id: str):
    all_comments = read_all(site_id, work_id, chapter_id)
    
    for c in all_comments:
        if c.get('id') == comment_id:
            if user_id:
                liked_by = c.get('likedBy', [])
                if user_id in liked_by:
                    return None
                liked_by.append(user_id)
                c['likedBy'] = liked_by
            
            c['likes'] = c.get('likes', 0) + 1
            write_all(site_id, work_id, chapter_id, all_comments)
            return c
    return None


def delete_comment(site_id: str, work_id: str, chapter_id: str, comment_id: str) -> bool:
    all_comments = read_all(site_id, work_id, chapter_id)
    
    for i, c in enumerate(all_comments):
        if c.get('id') == comment_id:
            all_comments.pop(i)
            write_all(site_id, work_id, chapter_id, all_comments)
            return True
    return False


def export_all() -> list:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    all_comments = []
    for file_path in DATA_DIR.glob('*.json'):
        try:
            content = json.loads(file_path.read_text(encoding='utf-8'))
            if isinstance(content, list):
                all_comments.extend(content)
        except Exception as e:
            print(f"Failed to read {file_path}: {e}")
    return all_comments


def import_all(comments: list) -> dict:
    if not isinstance(comments, list):
        raise ValueError("Invalid data format")
    
    groups = {}
    for c in comments:
        if not all(k in c for k in ('siteId', 'workId', 'chapterId')):
            continue
        key = f"{c['siteId']}__{c['workId']}__{c['chapterId']}"
        if key not in groups:
            groups[key] = []
        groups[key].append(c)
    
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    count = 0
    
    for key, items in groups.items():
        if not items:
            continue
        site_id = items[0]['siteId']
        work_id = items[0]['workId']
        chapter_id = items[0]['chapterId']
        
        existing = read_all(site_id, work_id, chapter_id)
        existing_ids = {c['id'] for c in existing if 'id' in c}
        
        for item in items:
            if item.get('id') in existing_ids:
                for i, e in enumerate(existing):
                    if e.get('id') == item.get('id'):
                        existing[i] = item
                        break
            else:
                existing.append(item)
        
        write_all(site_id, work_id, chapter_id, existing)
        count += len(items)
    
    return {'success': True, 'count': count}


# ==================== JWT 验证 ====================

def base64url_decode(s: str) -> bytes:
    padding = 4 - len(s) % 4
    if padding != 4:
        s += '=' * padding
    s = s.replace('-', '+').replace('_', '/')
    return base64.b64decode(s)


def verify_jwt(token: str, expected_site_id: str = None) -> dict | None:
    if not token:
        return None
    
    parts = token.split('.')
    if len(parts) != 3:
        return None
    
    try:
        header = json.loads(base64url_decode(parts[0]))
        if header.get('alg') != 'HS256':
            return None
        
        payload = json.loads(base64url_decode(parts[1]))
    except:
        return None
    
    site_id = payload.get('siteId')
    if not site_id or (expected_site_id and site_id != expected_site_id):
        return None
    
    secret = SITE_SECRETS.get(site_id)
    if not secret:
        return None
    
    data = f"{parts[0]}.{parts[1]}"
    expected_sig = base64.urlsafe_b64encode(
        hmac.new(secret.encode(), data.encode(), hashlib.sha256).digest()
    ).decode().rstrip('=')
    
    if not hmac.compare_digest(expected_sig, parts[2]):
        return None
    
    exp = payload.get('exp')
    if isinstance(exp, (int, float)) and datetime.utcnow().timestamp() > exp:
        return None
    
    return payload


def get_client_ip(headers: dict) -> str:
    forwarded = headers.get('X-Forwarded-For', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return '127.0.0.1'


# ==================== 网页抓取 ====================

def fetch_with_httpx(url: str) -> str:
    """使用 httpx 抓取 - 使用 browserforge 生成真实浏览器请求头"""
    
    # 使用 browserforge 生成请求头，如果不可用则使用默认值
    if HEADER_GEN:
        headers = HEADER_GEN.generate()
        # 确保关键头存在
        headers.setdefault('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
    else:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"macOS"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
        }
    
    with httpx.Client(follow_redirects=True, timeout=30) as client:
        resp = client.get(url, headers=headers)
        resp.raise_for_status()
        return resp.text


def fetch_with_playwright(url: str) -> str:
    """使用 Playwright 抓取 (需要安装: pip install playwright && playwright install chromium)"""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise RuntimeError("Playwright not installed. Run: pip install playwright && playwright install chromium")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport={'width': 1280, 'height': 800}
        )
        page = context.new_page()
        page.goto(url, wait_until='domcontentloaded', timeout=60000)
        
        # 等待内容加载
        page.wait_for_timeout(2000)
        content = page.content()
        
        browser.close()
        return content


# 是否启用 Playwright (环境变量控制)
ENABLE_PLAYWRIGHT = os.environ.get('ENABLE_PLAYWRIGHT', 'false').lower() == 'true'


def fetch_page_content(url: str) -> str:
    """抓取网页内容 - 优先 httpx，失败降级 Playwright"""
    try:
        return fetch_with_httpx(url)
    except httpx.HTTPStatusError as e:
        if e.response.status_code in (403, 401, 503):
            print(f"httpx failed ({e.response.status_code}), trying Playwright...")
            if ENABLE_PLAYWRIGHT:
                return fetch_with_playwright(url)
            else:
                raise RuntimeError(f"Access denied ({e.response.status_code}). Enable Playwright: ENABLE_PLAYWRIGHT=true")
        raise


def fetch_telegraph(slug: str) -> dict | None:
    """抓取 Telegra.ph 文章"""
    api_url = f"https://api.telegra.ph/getPage/{slug}?return_content=true"
    
    with httpx.Client(timeout=10) as client:
        resp = client.get(api_url)
        data = resp.json()
    
    if not data.get('ok'):
        return None
    
    page = data['result']
    
    def render_node(node):
        if isinstance(node, str):
            return node
        if not isinstance(node, dict) or 'tag' not in node:
            return ''
        
        tag = node['tag']
        children = ''.join(render_node(c) for c in node.get('children', []))
        attrs = node.get('attrs', {})
        
        # 修复相对路径图片
        if 'src' in attrs and attrs['src'].startswith('/'):
            attrs['src'] = f"https://telegra.ph{attrs['src']}"
        
        attr_str = ' '.join(f'{k}="{v}"' for k, v in attrs.items())
        
        if tag in ('img', 'br', 'hr'):
            return f"<{tag} {attr_str} />"
        
        return f"<{tag} {attr_str}>{children}</{tag}>"
    
    content = page.get('content', [])
    content_html = ''.join(render_node(n) for n in content)
    if not content_html:
        content_html = f"<p>{page.get('description', '')}</p>"
    
    return {
        'title': page.get('title', ''),
        'content': content_html,
        'byline': page.get('author_name', ''),
        'siteName': 'Telegra.ph',
        'workId': slug,
        'siteId': 'telegraph-proxy',
        'chapterId': 'index',
        'mode': 'telegraph'
    }


def fetch_reader_mode(url: str) -> dict:
    """Reader 模式 - 提取正文"""
    html = fetch_page_content(url)
    doc = Document(html)
    
    parsed = urlparse(url)
    work_id = 'r_' + hashlib.md5(url.encode()).hexdigest()
    
    return {
        'title': doc.title() or '',
        'content': doc.summary(),
        'byline': '',
        'siteName': parsed.hostname,
        'sourceUrl': url,
        'workId': work_id,
        'siteId': 'paranote-reader',
        'chapterId': 'index',
        'mode': 'reader'
    }


def fetch_raw_mode(url: str) -> dict:
    """Raw 模式 - 原样导入"""
    html = fetch_page_content(url)
    parsed = urlparse(url)
    
    # 添加 base 标签
    if '<base' not in html.lower():
        html = html.replace('<head>', f'<head><base href="{url}">', 1)
    
    # 移除脚本
    html = re.sub(r'<script\b[^>]*>[\s\S]*?</script>', '', html, flags=re.IGNORECASE)
    
    # 修复懒加载图片
    html = re.sub(r'\sdata-(src|original)="([^"]*)"', r' src="\2"', html, flags=re.IGNORECASE)
    
    work_id = hashlib.md5(parsed.hostname.encode()).hexdigest()
    chapter_id = hashlib.md5(url.encode()).hexdigest()
    
    return {
        'title': '',
        'content': html,
        'byline': '',
        'siteName': parsed.hostname,
        'sourceUrl': url,
        'workId': work_id,
        'siteId': 'imported',
        'chapterId': chapter_id,
        'mode': 'raw'
    }


# ==================== HTTP Handler ====================

class ParaNoteHandler(BaseHTTPRequestHandler):
    
    def send_json(self, status: int, data: dict):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type,X-Paranote-Token,X-Admin-Secret')
        self.end_headers()
        self.wfile.write(body)
    
    def send_file(self, file_path: Path, content_type: str):
        try:
            content = file_path.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.end_headers()
            self.wfile.write(content)
        except FileNotFoundError:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'Not found')
    
    def parse_body(self) -> dict | None:
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length == 0:
            return None
        body = self.rfile.read(content_length)
        return json.loads(body.decode('utf-8'))
    
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type,X-Paranote-Token,X-Admin-Secret')
        self.end_headers()
    
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        
        # API: 获取评论
        if path == '/api/v1/comments':
            site_id = query.get('siteId', [None])[0]
            work_id = query.get('workId', [None])[0]
            chapter_id = query.get('chapterId', [None])[0]
            
            if not all([site_id, work_id, chapter_id]):
                return self.send_json(400, {'error': 'missing siteId/workId/chapterId'})
            
            try:
                data = list_comments(site_id, work_id, chapter_id)
                return self.send_json(200, {'commentsByPara': data})
            except Exception as e:
                return self.send_json(500, {'error': str(e)})
        
        # API: 抓取网页 (仅 full/reader 模式可用)
        if path == '/api/v1/fetch':
            if DEPLOY_MODE == 'api':
                return self.send_json(404, {'error': 'fetch_api_disabled', 'message': 'Set DEPLOY_MODE=full or reader to enable'})
            
            target_url = query.get('url', [None])[0]
            mode = query.get('mode', ['reader'])[0]
            
            if not target_url:
                return self.send_json(400, {'error': 'missing_url'})
            
            try:
                parsed_url = urlparse(target_url)
                
                # Telegra.ph 特殊处理
                if 'telegra.ph' in parsed_url.hostname and parsed_url.path != '/':
                    slug = parsed_url.path.lstrip('/')
                    result = fetch_telegraph(slug)
                    if result:
                        result['sourceUrl'] = target_url
                        return self.send_json(200, result)
                    return self.send_json(404, {'error': 'telegraph_not_found'})
                
                # 普通网页
                if mode == 'raw':
                    result = fetch_raw_mode(target_url)
                else:
                    result = fetch_reader_mode(target_url)
                
                return self.send_json(200, result)
                
            except Exception as e:
                return self.send_json(500, {'error': 'fetch_failed', 'message': str(e)})
        
        # API: 导出
        if path == '/api/v1/export':
            secret = self.headers.get('X-Admin-Secret', '')
            if not ADMIN_SECRET or secret != ADMIN_SECRET:
                return self.send_json(403, {'error': 'forbidden'})
            
            try:
                data = export_all()
                return self.send_json(200, data)
            except Exception as e:
                return self.send_json(500, {'error': str(e)})
        
        # 兼容旧路由：重定向 (仅 full/reader 模式)
        if path == '/read' and DEPLOY_MODE != 'api':
            target_url = query.get('url', [None])[0]
            if not target_url:
                self.send_response(302)
                self.send_header('Location', '/')
                self.end_headers()
                return
            self.send_response(302)
            self.send_header('Location', f'/public/reader.html?url={urllib.parse.quote(target_url)}&mode=reader')
            self.end_headers()
            return
        
        if path == '/import' and DEPLOY_MODE != 'api':
            target_url = query.get('url', [None])[0]
            if not target_url:
                self.send_response(302)
                self.send_header('Location', '/')
                self.end_headers()
                return
            self.send_response(302)
            self.send_header('Location', f'/public/reader.html?url={urllib.parse.quote(target_url)}&mode=raw')
            self.end_headers()
            return
        
        # 健康检查 (所有模式)
        if path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'ok')
            return
        
        # 静态文件 - embed.js (所有模式，评论嵌入脚本)
        if path in ('/public/embed.js', '/embed.js'):
            return self.send_file(PUBLIC_DIR / 'embed.js', 'application/javascript; charset=utf-8')
        
        # 静态文件 - 首页 (仅 full 模式)
        if path == '/' and DEPLOY_MODE == 'full':
            return self.send_file(PUBLIC_DIR / 'index.html', 'text/html; charset=utf-8')
        
        # 静态文件 - 阅读器 (仅 full/reader 模式)
        if path == '/public/reader.html' and DEPLOY_MODE != 'api':
            return self.send_file(PUBLIC_DIR / 'reader.html', 'text/html; charset=utf-8')
        
        # API 模式下的根路径返回 API 信息
        if path == '/' and DEPLOY_MODE == 'api':
            return self.send_json(200, {
                'service': 'ParaNote API',
                'mode': 'api',
                'endpoints': [
                    'GET  /api/v1/comments',
                    'POST /api/v1/comments',
                    'POST /api/v1/comments/like',
                    'DELETE /api/v1/comments',
                    'GET  /api/v1/export',
                    'POST /api/v1/import',
                    'GET  /health'
                ]
            })
        
        # reader 模式下的根路径重定向到阅读器
        if path == '/' and DEPLOY_MODE == 'reader':
            self.send_response(302)
            self.send_header('Location', '/public/reader.html')
            self.end_headers()
            return
        
        # 404
        self.send_response(404)
        self.end_headers()
        self.wfile.write(b'Not found')
    
    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        
        # API: 创建评论
        if path == '/api/v1/comments':
            try:
                body = self.parse_body()
                if not body:
                    return self.send_json(400, {'error': 'empty_body'})
                
                site_id = body.get('siteId')
                work_id = body.get('workId')
                chapter_id = body.get('chapterId')
                para_index = body.get('paraIndex')
                content = body.get('content', '').strip()
                user_name = body.get('userName')
                context_text = body.get('contextText')
                
                if not all([site_id, work_id, chapter_id, isinstance(para_index, int), content]):
                    return self.send_json(400, {'error': 'missing_fields'})
                
                # JWT 验证
                token = self.headers.get('X-Paranote-Token', '')
                jwt_payload = verify_jwt(token, site_id)
                
                final_user_name = None
                user_id = None
                user_avatar = None
                
                if jwt_payload:
                    final_user_name = jwt_payload.get('name') or jwt_payload.get('username')
                    user_id = jwt_payload.get('sub') or jwt_payload.get('userId')
                    user_avatar = jwt_payload.get('avatar')
                
                if not final_user_name:
                    final_user_name = user_name
                
                # 匿名用户 IP 标识
                if not user_id:
                    ip = get_client_ip(dict(self.headers))
                    ip_hash = hashlib.md5((ip + site_id).encode()).hexdigest()
                    user_id = f'ip_{ip_hash}'
                    if final_user_name == '匿名':
                        final_user_name = f'访客-{ip_hash[:6]}'
                
                if not final_user_name:
                    final_user_name = '匿名'
                
                comment = create_comment({
                    'siteId': site_id,
                    'workId': work_id,
                    'chapterId': chapter_id,
                    'paraIndex': para_index,
                    'content': content,
                    'userName': final_user_name,
                    'userId': user_id,
                    'userAvatar': user_avatar,
                    'contextText': context_text
                })
                
                return self.send_json(201, comment)
                
            except json.JSONDecodeError:
                return self.send_json(400, {'error': 'invalid_json'})
            except Exception as e:
                return self.send_json(500, {'error': str(e)})
        
        # API: 点赞
        if path == '/api/v1/comments/like':
            try:
                body = self.parse_body()
                if not body:
                    return self.send_json(400, {'error': 'empty_body'})
                
                site_id = body.get('siteId')
                work_id = body.get('workId')
                chapter_id = body.get('chapterId')
                comment_id = body.get('commentId')
                
                if not all([site_id, work_id, chapter_id, comment_id]):
                    return self.send_json(400, {'error': 'missing_fields'})
                
                # 获取用户 ID
                token = self.headers.get('X-Paranote-Token', '')
                jwt_payload = verify_jwt(token, site_id)
                
                user_id = None
                if jwt_payload:
                    user_id = jwt_payload.get('sub') or jwt_payload.get('userId')
                
                if not user_id:
                    ip = get_client_ip(dict(self.headers))
                    ip_hash = hashlib.md5((ip + site_id).encode()).hexdigest()
                    user_id = f'ip_{ip_hash}'
                
                if not user_id:
                    return self.send_json(401, {'error': 'login_required_to_like'})
                
                result = like_comment(site_id, work_id, chapter_id, comment_id, user_id)
                if result:
                    return self.send_json(200, {'likes': result.get('likes', 0)})
                return self.send_json(400, {'error': 'already_liked_or_not_found'})
                
            except Exception as e:
                return self.send_json(500, {'error': str(e)})
        
        # API: 导入
        if path == '/api/v1/import':
            secret = self.headers.get('X-Admin-Secret', '')
            if not ADMIN_SECRET or secret != ADMIN_SECRET:
                return self.send_json(403, {'error': 'forbidden'})
            
            try:
                body = self.parse_body()
                if not isinstance(body, list):
                    return self.send_json(400, {'error': 'invalid_data_format'})
                
                result = import_all(body)
                return self.send_json(200, result)
            except Exception as e:
                return self.send_json(500, {'error': str(e)})
        
        self.send_response(404)
        self.end_headers()
    
    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path
        
        if path == '/api/v1/comments':
            try:
                body = self.parse_body()
                if not body:
                    return self.send_json(400, {'error': 'empty_body'})
                
                site_id = body.get('siteId')
                work_id = body.get('workId')
                chapter_id = body.get('chapterId')
                comment_id = body.get('commentId')
                edit_token = body.get('editToken')
                
                if not all([site_id, work_id, chapter_id, comment_id]):
                    return self.send_json(400, {'error': 'missing_fields'})
                
                # 权限检查
                token = self.headers.get('X-Paranote-Token', '')
                jwt_payload = verify_jwt(token, site_id)
                
                is_admin = jwt_payload and (jwt_payload.get('role') == 'admin' or jwt_payload.get('isAdmin'))
                is_author = bool(edit_token)
                
                if not is_admin and not is_author:
                    return self.send_json(403, {'error': 'permission_denied'})
                
                success = delete_comment(site_id, work_id, chapter_id, comment_id)
                if success:
                    return self.send_json(200, {'success': True})
                return self.send_json(404, {'error': 'not_found'})
                
            except Exception as e:
                return self.send_json(500, {'error': str(e)})
        
        self.send_response(404)
        self.end_headers()
    
    def log_message(self, format, *args):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {args[0]}")


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    server = HTTPServer(('', PORT), ParaNoteHandler)
    print(f"ParaNote (Python) listening on http://localhost:{PORT}")
    print(f"- Storage: file")
    print(f"- Deploy mode: {DEPLOY_MODE}")
    
    mode_desc = {
        'full': '完整部署 (首页 + 阅读器 + 所有API)',
        'api': '仅核心API (评论CRUD，无 /api/v1/fetch)',
        'reader': 'API + 阅读器 (含 /api/v1/fetch，无首页)'
    }
    print(f"  {mode_desc.get(DEPLOY_MODE, '未知模式')}")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()


if __name__ == '__main__':
    main()
