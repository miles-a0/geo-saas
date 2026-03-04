#!/usr/bin/env python3
"""
Geo SEO Report Worker
Polls Redis queue for report generation jobs and processes them.
Optimized to minimize API calls to OpenRouter.
"""

import os
import json
import time
import logging
from datetime import datetime
from typing import Dict, Any, Optional

import redis
import requests
from bs4 import BeautifulSoup
from jinja2 import Template
from weasyprint import HTML
from PIL import Image, ImageDraw, ImageFont
import io

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Environment variables
REDIS_HOST = os.getenv('REDIS_HOST', 'redis')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
API_BASE_URL = os.getenv('API_BASE_URL', 'http://api:3001')
OPENROUTER_API_KEY = os.getenv('OPENROUTER_API_KEY', '')
REPORTS_DIR = '/app/reports'

# Initialize Redis client
redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)

# Ensure reports directory exists
os.makedirs(REPORTS_DIR, exist_ok=True)


class ReportGenerator:
    """Handles geo SEO report generation with OpenRouter API optimization."""
    
    def __init__(self, report_id: str, website_url: str, target_keywords: list, user_email: str):
        self.report_id = report_id
        self.website_url = website_url
        self.target_keywords = target_keywords
        self.user_email = user_email
        self.data = {
            'website_url': website_url,
            'target_keywords': target_keywords,
            'analysis': {},
            'recommendations': [],
            'score': 0
        }
    
    def update_status(self, status: str, error: str = None):
        """Update report status in Redis."""
        key = f'report:{self.report_id}'
        data = {'status': status, 'updated_at': datetime.utcnow().isoformat()}
        if error:
            data['error'] = error
        redis_client.hset(key, mapping=data)
        redis_client.expire(key, 86400)  # 24 hour expiry
    
    def fetch_website(self) -> Optional[BeautifulSoup]:
        """Fetch and parse website HTML with single request."""
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            response = requests.get(self.website_url, headers=headers, timeout=15)
            response.raise_for_status()
            return BeautifulSoup(response.content, 'lxml')
        except Exception as e:
            logger.error(f"Failed to fetch {self.website_url}: {e}")
            return None
    
    def analyze_onpage_seo(self, soup: BeautifulSoup):
        """Analyze on-page SEO elements - no API calls needed."""
        analysis = {}
        
        # Title tag
        title = soup.find('title')
        analysis['title'] = {
            'found': bool(title),
            'text': title.get_text().strip() if title else '',
            'length': len(title.get_text()) if title else 0
        }
        
        # Meta description
        meta_desc = soup.find('meta', attrs={'name': 'description'})
        analysis['meta_description'] = {
            'found': bool(meta_desc),
            'text': meta_desc.get('content', '') if meta_desc else '',
            'length': len(meta_desc.get('content', '')) if meta_desc else 0
        }
        
        # H1 tags
        h1s = soup.find_all('h1')
        analysis['h1'] = {
            'count': len(h1s),
            'texts': [h.get_text().strip() for h in h1s]
        }
        
        # H2 tags
        h2s = soup.find_all('h2')
        analysis['h2'] = {
            'count': len(h2s),
            'texts': [h.get_text().strip()[:100] for h in h2s]
        }
        
        # Canonical URL
        canonical = soup.find('link', attrs={'rel': 'canonical'})
        analysis['canonical'] = {
            'found': bool(canonical),
            'url': canonical.get('href', '') if canonical else ''
        }
        
        # Language attribute
        html = soup.find('html')
        analysis['language'] = html.get('lang', '') if html else ''
        
        # Schema.org / JSON-LD
        scripts = soup.find_all('script', type='application/ld+json')
        analysis['schema'] = {
            'found': len(scripts) > 0,
            'count': len(scripts)
        }
        
        # Open Graph tags
        og_tags = soup.find_all('meta', property=lambda x: x and x.startswith('og:'))
        analysis['opengraph'] = {
            'found': len(og_tags) > 0,
            'count': len(og_tags)
        }
        
        self.data['analysis']['onpage'] = analysis
    
    def analyze_keywords(self, soup: BeautifulSoup):
        """Analyze keyword usage in content - efficient text analysis."""
        text = soup.get_text(separator=' ', strip=True).lower()
        word_count = len(text.split())
        
        keyword_analysis = []
        for kw in self.target_keywords:
            kw_lower = kw.lower()
            count = text.count(kw_lower)
            density = (count / word_count * 100) if word_count > 0 else 0
            
            # Check title
            title = soup.find('title')
            in_title = kw_lower in title.get_text().lower() if title else False
            
            # Check meta description
            meta = soup.find('meta', attrs={'name': 'description'})
            in_meta = kw_lower in meta.get('content', '').lower() if meta else False
            
            keyword_analysis.append({
                'keyword': kw,
                'count': count,
                'density': round(density, 2),
                'in_title': in_title,
                'in_meta_description': in_meta
            })
        
        self.data['analysis']['keywords'] = keyword_analysis
    
    def analyze_local_seo(self, soup: BeautifulSoup):
        """Analyze local SEO signals - efficient DOM analysis."""
        html = str(soup)
        
        # NAP (Name, Address, Phone) signals
        import re
        phone_pattern = r'(\+?44[\s\-]?)?(0[\s\-]?)?[1-9][\s\-]?\d{2,4}[\s\-]?\d{3,4}[\s\-]?\d{3,4}'
        phones = re.findall(phone_pattern, html)
        
        # Check for address indicators
        address_indicators = ['street', 'road', 'avenue', 'lane', 'close', 'way', 'city', 'postcode']
        has_address = any(ind in html.lower() for ind in address_indicators)
        
        # Google Maps embed
        maps_embed = 'maps.google' in html or 'google.com/maps' in html
        
        # Local business schema
        has_local_schema = 'LocalBusiness' in html or '"@type":"LocalBusiness' in html
        
        self.data['analysis']['local'] = {
            'phone_found': len(phones) > 0,
            'address_indicators': has_address,
            'maps_embed': maps_embed,
            'local_schema': has_local_schema
        }
    
    def generate_ai_insights(self) -> str:
        """Generate AI-powered insights using OpenRouter - optimized single call."""
        if not OPENROUTER_API_KEY:
            logger.warning("No OpenRouter API key - using basic insights")
            return self._generate_basic_insights()
        
        try:
            # Prepare minimal context for single API call
            analysis = self.data['analysis']
            keywords = analysis.get('keywords', [])
            
            prompt = f"""Analyze this website's GEO SEO and provide 5 specific improvement recommendations.

Website: {self.website_url}
Keywords: {', '.join(self.target_keywords)}

On-Page: Title={analysis.get('onpage', {}).get('title', {}).get('text', 'N/A')[:50]}, 
Meta desc={analysis.get('onpage', {}).get('meta_description', {}).get('text', 'N/A')[:80]}
Local SEO: Phone={analysis.get('local', {}).get('phone_found')}, 
Address={analysis.get('local', {}).get('address_indicators')}, 
Schema={analysis.get('local', {}).get('local_schema')}

Provide exactly 5 numbered recommendations, each as a short sentence."""
            
            response = requests.post(
                'https://openrouter.ai/api/v1/chat/completions',
                headers={
                    'Authorization': f'Bearer {OPENROUTER_API_KEY}',
                    'Content-Type': 'application/json',
                    'HTTP-Referer': API_BASE_URL,
                    'X-Title': 'GeoSEO Report'
                },
                json={
                    'model': 'openai/gpt-3.5-turbo',
                    'messages': [{'role': 'user', 'content': prompt}],
                    'max_tokens': 300,
                    'temperature': 0.7
                },
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                content = result['choices'][0]['message']['content']
                # Parse numbered recommendations
                recommendations = []
                for line in content.split('\n'):
                    line = line.strip()
                    if line and (line[0].isdigit() or line.startswith('-')):
                        recommendations.append(line.lstrip('1234567890.-) '))
                return recommendations[:5]
            else:
                logger.error(f"OpenRouter API error: {response.status_code}")
                return self._generate_basic_insights()
                
        except Exception as e:
            logger.error(f"AI insights generation failed: {e}")
            return self._generate_basic_insights()
    
    def _generate_basic_insights(self) -> list:
        """Generate basic recommendations without AI."""
        recommendations = []
        onpage = self.data['analysis'].get('onpage', {})
        local = self.data['analysis'].get('local', {})
        
        if not onpage.get('title', {}).get('found'):
            recommendations.append("Add a descriptive title tag to improve search visibility")
        
        if not onpage.get('meta_description', {}).get('found'):
            recommendations.append("Add a meta description to improve click-through rates")
        
        if not onpage.get('h1', {}).get('count') or onpage.get('h1', {}).get('count') > 1:
            recommendations.append("Ensure exactly one H1 tag per page with target keywords")
        
        if not local.get('phone_found'):
            recommendations.append("Add a phone number to improve local search visibility")
        
        if not local.get('address_indicators'):
            recommendations.append("Add your business address to improve local SEO")
        
        return recommendations[:5]
    
    def calculate_score(self):
        """Calculate overall geo SEO score."""
        score = 0
        analysis = self.data['analysis']
        
        # On-page (40 points)
        onpage = analysis.get('onpage', {})
        if onpage.get('title', {}).get('found') and onpage.get('title', {}).get('length', 0) > 0:
            score += 10
        if onpage.get('meta_description', {}).get('found'):
            score += 10
        if onpage.get('h1', {}).get('count') == 1:
            score += 10
        if onpage.get('canonical', {}).get('found'):
            score += 5
        if onpage.get('language', {}):
            score += 5
        
        # Keywords (30 points)
        keywords = analysis.get('keywords', [])
        for kw in keywords:
            if kw.get('in_title'):
                score += 5
            if kw.get('in_meta_description'):
                score += 5
            if 0.5 <= kw.get('density', 0) <= 3:
                score += 5
        
        # Local SEO (30 points)
        local = analysis.get('local', {})
        if local.get('phone_found'):
            score += 10
        if local.get('address_indicators'):
            score += 10
        if local.get('maps_embed'):
            score += 5
        if local.get('local_schema'):
            score += 5
        
        self.data['score'] = min(score, 100)
    
    def generate_pdf(self) -> str:
        """Generate PDF report using WeasyPrint."""
        template_path = os.path.join(os.path.dirname(__file__), '..', 'templates', 'report.html')
        
        # Check if template exists, create default if not
        if not os.path.exists(template_path):
            html_content = self._get_default_template()
        else:
            with open(template_path, 'r') as f:
                html_content = f.read()
        
        template = Template(html_content)
        rendered_html = template.render(
            website_url=self.website_url,
            keywords=self.target_keywords,
            score=self.data['score'],
            analysis=self.data['analysis'],
            recommendations=self.data['recommendations'],
            generated_at=datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')
        )
        
        # Convert to PDF
        pdf_bytes = HTML(string=rendered_html).write_pdf()
        
        # Save to file
        filename = f'report_{self.report_id}.pdf'
        filepath = os.path.join(REPORTS_DIR, filename)
        
        with open(filepath, 'wb') as f:
            f.write(pdf_bytes)
        
        return filename
    
    def _get_default_template(self) -> str:
        """Default HTML template for reports."""
        logo_path = os.path.join(os.path.dirname(__file__), '..', 'templates', 'G-SEO_Logo.jpg')
        logo_data = None
        if os.path.exists(logo_path):
            import base64
            with open(logo_path, 'rb') as f:
                logo_data = base64.b64encode(f.read()).decode('utf-8')
        
        logo_img = f'<img src="data:image/jpeg;base64,{logo_data}" alt="G-SEO Logo" style="max-height: 80px; margin-bottom: 20px;" />' if logo_data else '<h1 style="color: #4F46E5;">G-SEO</h1>'
        
        return f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>G-SEO Report - {{ website_url }}</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 40px; color: #333; }}
        .header {{ text-align: center; margin-bottom: 40px; }}
        .score {{ font-size: 72px; font-weight: bold; color: #2563eb; }}
        .section {{ margin: 30px 0; }}
        h2 {{ color: #1e40af; border-bottom: 2px solid #2563eb; padding-bottom: 10px; }}
        table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
        th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }}
        th {{ background: #f3f4f6; }}
        .recommendation {{ background: #fef3c7; padding: 15px; margin: 10px 0; border-left: 4px solid #f59e0b; }}
    </style>
</head>
<body>
    <div class="header">
        {logo_img}
        <h1>G-SEO Analysis Report</h1>
        <p>{{ website_url }}</p>
        <div class="score">{{ score }}/100</div>
        <p>Generated: {{ generated_at }}</p>
    </div>
    
    <div class="section">
        <h2>Target Keywords</h2>
        <p>{{ keywords|join(', ') }}</p>
    </div>
    
    <div class="section">
        <h2>On-Page Analysis</h2>
        <table>
            <tr><th>Element</th><th>Status</th><th>Details</th></tr>
            <tr><td>Title Tag</td><td>{{ '✓ Found' if analysis.onpage.title.found else '✗ Missing' }}</td><td>{{ analysis.onpage.title.text[:60] }}</td></tr>
            <tr><td>Meta Description</td><td>{{ '✓ Found' if analysis.onpage.meta_description.found else '✗ Missing' }}</td><td>{{ analysis.onpage.meta_description.text[:80] }}</td></tr>
            <tr><td>H1 Tags</td><td>{{ analysis.onpage.h1.count }}</td><td>{{ analysis.onpage.h1.texts[:2]|join(', ') }}</td></tr>
            <tr><td>Canonical URL</td><td>{{ '✓ Found' if analysis.onpage.canonical.found else '✗ Missing' }}</td><td>{{ analysis.onpage.canonical.url[:50] }}</td></tr>
        </table>
    </div>
    
    <div class="section">
        <h2>Recommendations</h2>
        {% for rec in recommendations %}
        <div class="recommendation">{{ rec }}</div>
        {% endfor %}
    </div>
</body>
</html>'''
    
    def run(self):
        """Execute full report generation pipeline."""
        logger.info(f"Starting report {self.report_id} for {self.website_url}")
        self.update_status('processing')
        
        try:
            # Step 1: Fetch website (single request)
            soup = self.fetch_website()
            if not soup:
                raise Exception("Failed to fetch website")
            
            # Step 2: Local analysis (no API calls)
            self.analyze_local_seo(soup)
            
            # Step 3: On-page analysis (no API calls)
            self.analyze_onpage_seo(soup)
            
            # Step 4: Keyword analysis (no API calls)
            self.analyze_keywords(soup)
            
            # Step 5: Generate recommendations (single API call)
            self.data['recommendations'] = self.generate_ai_insights()
            
            # Step 6: Calculate score
            self.calculate_score()
            
            # Step 7: Generate PDF
            pdf_filename = self.generate_pdf()
            
            # Update status with results
            redis_client.hset(f'report:{self.report_id}', mapping={
                'status': 'completed',
                'score': self.data['score'],
                'pdf_file': pdf_filename,
                'completed_at': datetime.utcnow().isoformat(),
                'data': json.dumps(self.data)
            })
            
            logger.info(f"Report {self.report_id} completed with score {self.data['score']}")
            
        except Exception as e:
            logger.error(f"Report {self.report_id} failed: {e}")
            self.update_status('failed', str(e))


def process_job(job_data: dict):
    """Process a single report generation job."""
    report_id = job_data.get('report_id')
    website_url = job_data.get('website_url')
    target_keywords = job_data.get('target_keywords', [])
    user_email = job_data.get('user_email')
    
    generator = ReportGenerator(report_id, website_url, target_keywords, user_email)
    generator.run()


def main():
    """Main worker loop - poll Redis queue."""
    logger.info("Geo SEO Worker started")
    
    while True:
        try:
            # Block for up to 5 seconds waiting for a job
            result = redis_client.blpop('queue:reports', timeout=5)
            
            if result:
                _, job_json = result
                job_data = json.loads(job_json)
                logger.info(f"Processing job: {job_data.get('report_id')}")
                process_job(job_data)
                
        except Exception as e:
            logger.error(f"Worker error: {e}")
            time.sleep(5)


if __name__ == '__main__':
    main()
