#!/usr/bin/env python3
"""
Geo SEO Report Worker - World Class GEO SEO Reporting System
Based on the geo-seo-claude framework: https://github.com/zubair-trabzada/geo-seo-claude
"""

import os
import json
import time
import logging
import re
from datetime import datetime
from typing import Dict, Any, Optional, List
from urllib.parse import urlparse, urljoin

import redis
import requests
from bs4 import BeautifulSoup
from jinja2 import Template
from xhtml2pdf import pisa
from io import BytesIO

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
OPENROUTER_MODEL = os.getenv('OPENROUTER_MODEL', 'openai/gpt-3.5-turbo')
REPORTS_DIR = '/app/reports'

# Initialize Redis client
redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)

# Ensure reports directory exists
os.makedirs(REPORTS_DIR, exist_ok=True)

# Scoring weights from the geo-seo-claude framework
SCORING_WEIGHTS = {
    'citability': 0.25,
    'brand_authority': 0.20,
    'eeat': 0.20,
    'technical': 0.15,
    'schema': 0.10,
    'platform': 0.10,
}


class ReportGenerator:
    """Handles comprehensive GEO SEO report generation with OpenRouter API."""
    
    def __init__(self, report_id: str, website_url: str, target_keywords: list, user_email: str):
        self.report_id = report_id
        self.website_url = website_url
        self.target_keywords = target_keywords
        self.user_email = user_email
        self.business_type = None
        self.pages_analyzed = []
        
        # Initialize comprehensive analysis results
        self.data = {
            'website_url': website_url,
            'target_keywords': target_keywords,
            'business_type': None,
            'pages_analyzed': [],
            'analysis': {
                'citability': {'score': 0, 'findings': [], 'recommendations': [], 'details': {}},
                'brand_authority': {'score': 0, 'findings': [], 'recommendations': [], 'details': {}},
                'eeat': {'score': 0, 'findings': [], 'recommendations': [], 'details': {}},
                'technical': {'score': 0, 'findings': [], 'recommendations': [], 'details': {}},
                'schema': {'score': 0, 'findings': [], 'recommendations': [], 'details': {}},
                'platform': {'score': 0, 'findings': [], 'recommendations': [], 'details': {}},
            },
            'issues': {
                'critical': [],
                'high': [],
                'medium': [],
                'low': [],
            },
            'quick_wins': [],
            'action_plan': {},
            'recommendations': [],
            'score': 0,
            'score_breakdown': {},
        }
    
    def update_status(self, status: str, error: str = None):
        """Update report status in Redis."""
        key = f'report:{self.report_id}'
        data = {'status': status, 'updated_at': datetime.utcnow().isoformat()}
        if error:
            data['error'] = error
        redis_client.hset(key, mapping=data)
        redis_client.expire(key, 86400)
    
    def fetch_page(self, url: str, timeout: int = 15) -> Optional[BeautifulSoup]:
        """Fetch and parse website HTML."""
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            }
            response = requests.get(url, headers=headers, timeout=timeout, allow_redirects=True)
            response.raise_for_status()
            return BeautifulSoup(response.content, 'lxml')
        except Exception as e:
            logger.error(f"Failed to fetch {url}: {e}")
            return None
    
    def detect_business_type(self, soup: BeautifulSoup) -> str:
        """Detect business type based on homepage signals."""
        html = str(soup).lower()
        
        # SaaS indicators
        saas_indicators = ['pricing', 'sign up', 'free trial', 'app.', 'features', 'integrations']
        if any(ind in html for ind in saas_indicators):
            return 'SaaS'
        
        # Local Business indicators
        local_indicators = ['address', 'near me', 'google maps', 'our team', 'opening hours']
        if any(ind in html for ind in local_indicators):
            return 'Local Business'
        
        # E-commerce indicators
        ecommerce_indicators = ['add to cart', 'buy now', 'product', 'shopping', 'price', 'checkout']
        if any(ind in html for ind in ecommerce_indicators):
            return 'E-commerce'
        
        # Publisher indicators
        publisher_indicators = ['blog', 'news', 'article', 'author', 'read more']
        if any(ind in html for ind in publisher_indicators):
            return 'Publisher'
        
        # Agency indicators
        agency_indicators = ['case study', 'portfolio', 'our work', 'clients', 'services']
        if any(ind in html for ind in agency_indicators):
            return 'Agency'
        
        return 'Business'
    
    def analyze_citability(self, soup: BeautifulSoup, url: str) -> Dict:
        """Analyze AI citability - how easily AI systems can cite the content."""
        findings = []
        recommendations = []
        details = {}
        score = 50  # Base score
        
        # Get page text content
        text = soup.get_text(separator=' ', strip=True)
        word_count = len(text.split())
        details['word_count'] = word_count
        
        # Check for Q&A content (high citability)
        questions = soup.find_all(['h1', 'h2', 'h3', 'h4'])
        qa_pairs = 0
        for q in questions:
            if q.get_text().strip().endswith('?'):
                qa_pairs += 1
        details['qa_pairs'] = qa_pairs
        
        if qa_pairs >= 3:
            score += 15
            findings.append(f"Found {qa_pairs} question-answering content blocks (high AI citability)")
            recommendations.append({
                'title': f"Great job! Your {qa_pairs} Q&A sections are well-optimized for AI citation",
                'description': "AI systems love Q&A content because it directly answers user questions. Your FAQ or question-and-answer sections make it easy for ChatGPT, Claude, and other AI to extract and cite your content.",
                'action': "No action needed - keep maintaining your Q&A content as you add more pages."
            })
        elif qa_pairs > 0:
            score += 5
            findings.append(f"Found {qa_pairs} Q&A content blocks")
            recommendations.append({
                'title': "Add more FAQ-style content",
                'description': "AI systems love Q&A content because it directly answers user questions. Currently you have limited Q&A sections which means AI might not be able to fully answer questions about your business.",
                'action': "Create a dedicated FAQ page or add 5-10 question-answer pairs to your key pages. Use this structure:\n\n<h3>Question text?</h3>\n<p>Answer text here...</p>\n\nThis makes it easy for AI to extract and cite your content."
            })
        
        # Check for structured lists (easier to cite)
        lists = soup.find_all(['ul', 'ol'])
        list_items = soup.find_all('li')
        if len(list_items) >= 5:
            score += 10
            findings.append(f"Found {len(list_items)} list items (structured content)")
            recommendations.append({
                'title': f"Great job! Your {len(list_items)} structured list items",
                'description': "Structured lists are one of the easiest content formats for AI to extract and cite. Your content is well-formatted for AI consumption.",
                'action': "No action needed - your list structure is excellent."
            })
        details['list_items'] = len(list_items)
        
        # Check paragraph length (optimal: 50-150 words)
        paragraphs = soup.find_all('p')
        optimal_paragraphs = 0
        for p in paragraphs:
            p_text = p.get_text().strip()
            if 50 <= len(p_text.split()) <= 150:
                optimal_paragraphs += 1
        
        details['optimal_paragraphs'] = optimal_paragraphs
        if optimal_paragraphs >= 3:
            score += 10
            findings.append(f"{optimal_paragraphs} paragraphs in optimal length range (50-150 words)")
            recommendations.append({
                'title': f"Great job! {optimal_paragraphs} paragraphs in optimal length range",
                'description': "Paragraphs between 50-150 words are ideal for AI extraction. They're long enough to provide context but short enough to be fully captured in citations.",
                'action': "No action needed - your paragraph length is excellent."
            })
        
        # Check for statistics/numbers (AI loves data)
        stats = re.findall(r'\d+%|\d+\.\d+|\$\d+|[0-9]+(,\d{3})+', text)
        if len(stats) >= 5:
            score += 10
            findings.append(f"Found {len(stats)} statistical data points")
            recommendations.append({
                'title': f"Great job! Your {len(stats)} data points/statistics",
                'description': "Statistics and numbers make your content highly citeable. AI systems specifically look for data points to include in their responses. Your content is data-rich.",
                'action': "No action needed - keep adding statistics and data to your content."
            })
        details['statistics'] = len(stats)
        
        # Penalize thin content
        if word_count < 300:
            score -= 20
            findings.append(f"Thin content: only {word_count} words")
            recommendations.append({
                'title': f"CRITICAL: Thin content - only {word_count} words",
                'description': "Your page has very little content. AI systems need substantial text to understand your business, services, and expertise. Thin content signals low value to AI.",
                'action': f"Expand your content to 800-1500 words minimum. Break into multiple sections with H2/H3 headings. Add detailed explanations, examples, statistics, and comprehensive answers to common questions about your business."
            })
        
        # Penalize JavaScript-heavy content
        scripts = soup.find_all('script')
        if len(scripts) > 10:
            score -= 5
            findings.append("Heavy JavaScript usage may hinder AI crawling")
            recommendations.append({
                'title': "Heavy JavaScript usage may hinder AI crawling",
                'description': "Your page uses significant JavaScript which some AI crawlers struggle to process. While Google can handle JavaScript, other AI systems may not render your content properly.",
                'action': "Ensure critical content is rendered server-side or in static HTML. Consider using progressive enhancement - the content should be visible without JavaScript. Test your page with a text-only browser to see if all content appears."
            })
        
        score = max(0, min(100, score))
        return {'score': score, 'findings': findings, 'recommendations': recommendations, 'details': details}
    
    def analyze_brand_authority(self, soup: BeautifulSoup, url: str) -> Dict:
        """Analyze brand authority signals."""
        findings = []
        recommendations = []
        details = {}
        score = 30  # Base score
        
        parsed = urlparse(url)
        domain = parsed.netloc
        
        # Extract company name from title
        title = soup.find('title')
        if title:
            company_name = title.get_text().split('|')[0].split('-')[0].strip()
            details['company_name'] = company_name
        
        # Check for social media links
        html = str(soup).lower()
        social_platforms = {
            'YouTube': ['youtube.com', 'youtu.be'],
            'Twitter': ['twitter.com', 'x.com'],
            'LinkedIn': ['linkedin.com'],
            'Facebook': ['facebook.com'],
            'Instagram': ['instagram.com'],
        }
        
        found_platforms = []
        for platform, domains in social_platforms.items():
            if any(d in html for d in domains):
                found_platforms.append(platform)
        
        details['social_links'] = found_platforms
        score += len(found_platforms) * 8
        if found_platforms:
            findings.append(f"Found links to {', '.join(found_platforms)}")
            recommendations.append({
                'title': f"Great job! Your {', '.join(found_platforms)} links help AI recognize your brand",
                'description': "Brand mentions on social platforms correlate 3x more with AI visibility. AI systems use these signals to verify your brand exists and is active.",
                'action': "No action needed - your social presence is helping AI recognize your brand."
            })
        else:
            recommendations.append({
                'title': "Add social media links to your website",
                'description': "Your website doesn't link to any social media profiles. AI systems use social presence as a trust signal - brands with active social profiles are seen as more legitimate and trustworthy.",
                'action': "Add social media links to your footer or header. Create profiles on YouTube, LinkedIn, and Twitter if you haven't already. Include links like: Your Company on YouTube, Your Company on LinkedIn, etc."
            })
        
        # Check for trust signals
        trust_indicators = ['trust', 'security', 'privacy policy', 'terms of service', 'contact us']
        trust_count = sum(1 for t in trust_indicators if t in html)
        if trust_count >= 3:
            score += 15
            findings.append(f"Found {trust_count} trust signals")
            recommendations.append({
                'title': f"Great job! Your {trust_count} trust signals build credibility",
                'description': "Trust signals like privacy policy, terms of service, and contact information help AI systems verify your business is legitimate. This is crucial for E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness).",
                'action': "No action needed - your trust signals are excellent."
            })
        else:
            recommendations.append({
                'title': f"Add more trust signals - only {trust_count} found",
                'description': "Trust signals help AI verify your business legitimacy. Without them, AI may view your site as less trustworthy.",
                'action': "Add these essential pages: Privacy Policy, Terms of Service, Contact Us page with phone/email/address. Display security badges if applicable (SSL, payment security logos)."
            })
        
        # Check for testimonials/reviews
        if 'testimonial' in html or 'review' in html:
            score += 10
            findings.append("Found testimonial/review content")
            recommendations.append({
                'title': "Great job! Testimonials present",
                'description': "Testimonials are powerful trust signals. AI systems recognize them as third-party validation of your expertise and service quality.",
                'action': "No action needed - keep collecting and displaying client testimonials."
            })
        else:
            recommendations.append({
                'title': "Add testimonials to your website",
                'description': "Testimonials provide third-party validation that AI systems use to assess your credibility. Without them, AI may question your expertise claims.",
                'action': "Create a testimonials page or add a section on your homepage. Request reviews from past clients. Include full names, photos, and specific results achieved where possible."
            })
        
        # Check for certifications
        award_patterns = ['award', 'certified', 'partner', 'member', 'verified']
        awards = sum(1 for a in award_patterns if a in html)
        if awards > 0:
            score += 5
            findings.append(f"Found {awards} certification/award indicators")
            recommendations.append({
                'title': f"Great job! Your {awards} certifications/awards help establish authority",
                'description': "Certifications and awards are powerful authority signals. AI systems use them to verify your expertise claims.",
                'action': "No action needed - keep displaying your certifications prominently."
            })
        else:
            recommendations.append({
                'title': "Add certification badges and awards",
                'description': "Certifications and awards establish authority. AI systems look for these signals to validate expertise claims.",
                'action': "Display any industry certifications, partner badges, or awards on your website. If you don't have any, consider obtaining relevant industry certifications."
            })
        
        score = max(0, min(100, score))
        return {'score': score, 'findings': findings, 'recommendations': recommendations, 'details': details}
    
    def analyze_eeat(self, soup: BeautifulSoup, url: str) -> Dict:
        """Analyze E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness)."""
        findings = []
        recommendations = []
        details = {}
        score = 40  # Base score
        
        html = str(soup).lower()
        
        # Experience signals
        experience_keywords = ['experience', 'years', 'since', 'established', 'history', 'our story']
        exp_count = sum(1 for k in experience_keywords if k in html)
        if exp_count >= 2:
            score += 10
            findings.append(f"Found {exp_count} experience signals")
            recommendations.append({
                'title': f"Great job! Your {exp_count} experience signals build credibility",
                'description': "Experience signals tell AI how long you've been in business and what you've done. This helps establish your authority in your field.",
                'action': "No action needed - your experience signals are strong."
            })
        else:
            recommendations.append({
                'title': "Add experience signals to your website",
                'description': "Experience signals tell AI how long you've been in business. Without them, AI can't verify your claims of expertise.",
                'action': "Add an 'Our Story' or 'About Us' page. Include: years in business, number of clients served, specific experience details (e.g., 'Since 2015', '10+ years experience')."
            })
        details['experience_signals'] = exp_count
        
        # Expertise signals
        expertise_keywords = ['expert', 'professional', 'specialist', 'certified', 'qualified']
        expert_count = sum(1 for k in expertise_keywords if k in html)
        if expert_count >= 2:
            score += 10
            findings.append(f"Found {expert_count} expertise signals")
            recommendations.append({
                'title': f"Great job! Your {expert_count} expertise signals help establish authority",
                'description': "Expertise signals tell AI you have the knowledge to provide accurate information. This is crucial for AI citation.",
                'action': "No action needed - your expertise signals are strong."
            })
        else:
            recommendations.append({
                'title': "Add expertise signals to your website",
                'description': "Expertise signals help AI verify your knowledge claims. Without them, AI may not cite your content as authoritative.",
                'action': "Add: team member bios with credentials, certifications, 'As seen in' media mentions, professional memberships, qualifications, and specific expertise areas."
            })
        details['expertise_signals'] = expert_count
        
        # Check for author information
        author_meta = soup.find('meta', attrs={'name': 'author'})
        if author_meta:
            score += 10
            findings.append("Found author metadata")
            recommendations.append({
                'title': "Great job! Author metadata present",
                'description': "Author metadata helps AI attribute content to specific experts, increasing trust in your content.",
                'action': "No action needed - your author attribution is working."
            })
        else:
            recommendations.append({
                'title': "Add author information to your content",
                'description': "Author information helps AI verify who created the content and their expertise. Content with clear authorship is more likely to be cited.",
                'action': "Add <meta name='author' content='Expert Name'> to pages. Create author bio pages with credentials, photo, and past work. Link author names to their bio from article pages."
            })
        
        # Check for about page
        about_links = soup.find_all('a', href=True)
        has_about = any('about' in a.get('href', '').lower() for a in about_links)
        if has_about:
            score += 10
            findings.append("Found About page link")
            recommendations.append({
                'title': "Great job! About page link present",
                'description': "An About page is essential for E-E-A-T. It tells AI who you are, what you do, and why you're qualified.",
                'action': "No action needed - your About page is helping AI understand your business."
            })
        else:
            recommendations.append({
                'title': "Add an About Us page",
                'description': "An About page is essential for E-E-A-T. AI systems check for it to verify your business legitimacy and expertise.",
                'action': "Create a comprehensive About Us page with: team photos, company history, mission statement, credentials, and why customers should trust you."
            })
        
        # Check for contact information
        contact_patterns = ['contact', 'email', 'phone', 'address', 'location']
        has_contact = any(p in html for p in contact_patterns)
        if has_contact:
            score += 10
            findings.append("Found contact information")
            recommendations.append({
                'title': "Great job! Contact information present",
                'description': "Contact information is crucial for trust. It proves your business is real and reachable.",
                'action': "No action needed - your contact information is helping build trust."
            })
        else:
            recommendations.append({
                'title': "Add contact information to your website",
                'description': "Contact information proves your business is real. Without it, AI may question your legitimacy.",
                'action': "Add a Contact page with: phone number, email address, physical address, and a contact form. For local SEO, include your full address."
            })
        
        score = max(0, min(100, score))
        return {'score': score, 'findings': findings, 'recommendations': recommendations, 'details': details}
    
    def analyze_technical(self, soup: BeautifulSoup, url: str) -> Dict:
        """Analyze technical SEO and AI crawler accessibility."""
        findings = []
        recommendations = []
        details = {}
        score = 50  # Base score
        
        # Check meta robots
        robots_meta = soup.find('meta', attrs={'name': 'robots'})
        if robots_meta:
            content = robots_meta.get('content', '')
            details['robots'] = content
            if 'noindex' in content.lower():
                score -= 30
                findings.append("WARNING: Page has noindex directive")
                recommendations.append({
                    'title': "CRITICAL: Page has noindex directive - invisible to search",
                    'description': "The noindex directive tells search engines and AI crawlers NOT to index your page. This makes your page invisible to AI systems.",
                    'action': "Remove 'noindex' from your robots meta tag immediately. Check your CMS settings or website platform to ensure pages are set to 'index'."
                })
        else:
            findings.append("No robots meta tag (good)")
            recommendations.append({
                'title': "Great job! No restrictive robots directives",
                'description': "Your page allows indexing - this is essential for AI to discover and cite your content.",
                'action': "No action needed."
            })
        
        # Check canonical URL
        canonical = soup.find('link', attrs={'rel': 'canonical'})
        if canonical:
            score += 10
            findings.append("Found canonical URL")
            details['canonical'] = canonical.get('href')
            recommendations.append({
                'title': "Great job! Canonical URL properly set",
                'description': "A canonical URL tells Google which version of a page is the 'main' one if there are duplicates (for example, with tracking parameters or www/non-www versions).",
                'action': "You don't need to touch this unless you create duplicate pages in future. Leave it as is."
            })
        else:
            findings.append("No canonical URL (should add)")
            recommendations.append({
                'title': "Add a canonical URL to your page",
                'description': "A canonical URL tells search engines which version of a page is the main one. Without it, you may have duplicate content issues that hurt your SEO.",
                'action': "Add this to your page's <head> section:\n<link rel='canonical' href='https://yoursite.com/page/'>\n\nReplace the URL with your actual page URL."
            })
        
        # Check viewport meta (mobile)
        viewport = soup.find('meta', attrs={'name': 'viewport'})
        if viewport:
            score += 10
            findings.append("Found viewport meta (mobile-friendly)")
            recommendations.append({
                'title': "Great job! Mobile viewport configured",
                'description': "This means your site tells mobile devices how to display the layout properly. Google now ranks your site based on the mobile version first, so this is critical.",
                'action': "No action needed here."
            })
        
        # Check Open Graph tags
        og_tags = soup.find_all('meta', property=lambda x: x and x.startswith('og:'))
        details['og_tags'] = len(og_tags)
        if len(og_tags) >= 3:
            score += 10
            findings.append(f"Found {len(og_tags)} Open Graph tags")
            recommendations.append({
                'title': f"Great job! {len(og_tags)} Open Graph tags present",
                'description': "Open Graph tags control how your page looks when shared on social media. Good OG tags mean better social visibility.",
                'action': "No action needed."
            })
        else:
            recommendations.append({
                'title': f"Only {len(og_tags)} Open Graph tags - add more for better social sharing",
                'description': "When someone shares your page on Facebook or LinkedIn, those platforms don't know what title, description, or image to show - so they guess. That looks amateur.",
                'action': "Add Open Graph meta tags in your page's <head> section:\n\n<meta property='og:title' content='Your Page Title'>\n<meta property='og:description' content='Your description (150-160 characters)'>\n<meta property='og:image' content='https://yoursite.com/image.jpg'>\n<meta property='og:url' content='https://yoursite.com/page/'>\n<meta property='og:type' content='website'>\n\nIf using WordPress, use an SEO plugin like Rank Math or Yoast to fill these in."
            })
        
        # Check SSL (we're on HTTPS)
        parsed = urlparse(url)
        if parsed.scheme == 'https':
            score += 10
            details['ssl'] = True
            findings.append("HTTPS enabled")
            recommendations.append({
                'title': "Great job! HTTPS enabled",
                'description': "This means your site has an SSL certificate and loads securely (https://). That's mandatory in 2026.",
                'action': "Nothing to fix here - you're secure."
            })
        
        # Check images for alt text
        images = soup.find_all('img')
        images_with_alt = [img for img in images if img.get('alt')]
        alt_ratio = len(images_with_alt) / len(images) if images else 0
        details['images_total'] = len(images)
        details['images_with_alt'] = len(images_with_alt)
        
        if len(images) > 0:
            if alt_ratio >= 0.8:
                score += 10
                findings.append(f"Good alt text coverage: {int(alt_ratio*100)}%")
                recommendations.append({
                    'title': f"Great job! {int(alt_ratio*100)}% alt text coverage",
                    'description': "Alt text describes images for Google and accessibility. Your coverage is excellent.",
                    'action': "No action needed."
                })
            else:
                findings.append(f"CRITICAL: {len(images) - len(images_with_alt)} images missing alt text")
                recommendations.append({
                    'title': f"CRITICAL: {len(images) - len(images_with_alt)} images missing alt text",
                    'description': "Alt text describes an image for Google (so it understands what the image is about) and screen readers (accessibility for visually impaired users).",
                    'action': f"Go to your media library. Click each image missing alt text. In the 'Alt Text' field, describe what's in the image clearly and naturally.\n\nExample:\nBad: image1.jpg\nGood: Red electric mountain bike parked outside a Yorkshire café\n\nDon't keyword-stuff. Just describe what's actually there. Every image should have meaningful alt text."
                })
        
        # Check heading structure
        h1_tags = soup.find_all('h1')
        details['h1_count'] = len(h1_tags)
        
        if len(h1_tags) == 1:
            score += 10
            findings.append("Perfect H1 structure (exactly one H1)")
            recommendations.append({
                'title': "Great job! Perfect H1 structure",
                'description': "Every page has exactly one H1 heading, which is the correct structure. The H1 is the main headline that tells Google what the page is primarily about.",
                'action': "No action needed."
            })
        elif len(h1_tags) == 0:
            score -= 15
            findings.append("No H1 tag found")
            recommendations.append({
                'title': "CRITICAL: No H1 tag found",
                'description': "Every page must have one H1 heading. Without it, Google doesn't know what the page is primarily about.",
                'action': "Add exactly one H1 tag to your page with your primary keyword:\n<h1>Your Primary Keyword - Brand Name</h1>\n\nMake sure there's only one H1 per page."
            })
        else:
            score -= 10
            findings.append(f"Multiple H1 tags found ({len(h1_tags)})")
            recommendations.append({
                'title': f"CRITICAL: {len(h1_tags)} H1 tags found - should be exactly one",
                'description': "Having multiple H1 tags confuses Google about your main topic. Each page should have one and only one H1.",
                'action': f"Reduce to exactly ONE H1 tag. Use H2-H6 for subheadings. Check your theme or page builder - it may be accidentally adding multiple H1s.\n\nExample:\nCorrect: <h1>Refurbished Bikes for Sale in Wakefield</h1>\nThen use H2s and H3s for subheadings."
            })
        
        score = max(0, min(100, score))
        return {'score': score, 'findings': findings, 'recommendations': recommendations, 'details': details}
    
    def analyze_schema(self, soup: BeautifulSoup, url: str) -> Dict:
        """Analyze Schema.org structured data."""
        findings = []
        recommendations = []
        details = {}
        score = 30  # Base score
        
        # Find all JSON-LD scripts
        json_ld_scripts = soup.find_all('script', type='application/ld+json')
        
        schema_types_found = []
        for script in json_ld_scripts:
            try:
                data = json.loads(script.string)
                if isinstance(data, dict):
                    schema_type = data.get('@type', '')
                    if schema_type:
                        schema_types_found.append(schema_type)
                elif isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict):
                            schema_type = item.get('@type', '')
                            if schema_type:
                                schema_types_found.append(schema_type)
            except:
                pass
        
        details['schema_types'] = list(set(schema_types_found))
        details['json_ld_count'] = len(json_ld_scripts)
        
        if len(json_ld_scripts) == 0:
            findings.append("CRITICAL: No JSON-LD structured data found")
            score = 20
            recommendations.append({
                'title': "CRITICAL: No structured data (JSON-LD) found",
                'description': "JSON-LD is code that tells Google and AI systems exactly what your content is about. Without it, AI has to guess - and often gets it wrong.",
                'action': "Add JSON-LD structured data to your page's <head> section. Here's a basic Organization schema to start:\n\n<script type='application/ld+json'>\n{\n  '@context': 'https://schema.org',\n  '@type': 'Organization',\n  'name': 'Your Company Name',\n  'url': 'https://yoursite.com',\n  'logo': 'https://yoursite.com/logo.png',\n  'sameAs': [\n    'https://twitter.com/yourcompany',\n    'https://linkedin.com/company/yourcompany'\n  ]\n}\n</script>\n\nIf using WordPress, use a schema plugin like Schema Pro or Rank Math."
            })
        else:
            score += len(json_ld_scripts) * 10
            findings.append(f"Found {len(json_ld_scripts)} JSON-LD scripts")
            recommendations.append({
                'title': f"Great job! {len(json_ld_scripts)} JSON-LD scripts present",
                'description': "Structured data helps AI understand exactly what your content is about. This improves citation chances.",
                'action': "No action needed - your structured data is working."
            })
            
            # Check for important schema types
            if 'Organization' in schema_types_found:
                recommendations.append({
                    'title': "Great job! Organization schema present",
                    'description': "Organization schema helps AI recognize your brand as a legitimate business entity.",
                    'action': "No action needed."
                })
            else:
                recommendations.append({
                    'title': "Add Organization schema",
                    'description': "Organization schema helps AI recognize your brand entity. Without it, AI may not properly identify your business.",
                    'action': "Add Organization schema to your homepage. Include: name, url, logo, and sameAs links to social profiles."
                })
            
            if 'LocalBusiness' in schema_types_found:
                recommendations.append({
                    'title': "Great job! LocalBusiness schema present",
                    'description': "LocalBusiness schema is crucial for local SEO - it tells Google your location, hours, and contact info.",
                    'action': "No action needed."
                })
            elif self.business_type == 'Local Business':
                recommendations.append({
                    'title': "Add LocalBusiness schema for local SEO",
                    'description': "For a local business, LocalBusiness schema is essential. It tells Google your address, phone, hours, and helps you appear in local searches.",
                    'action': "Add LocalBusiness schema with: address, telephone, openingHours, geo coordinates, priceRange. Use a schema plugin or add manually."
                })
        
        score = max(0, min(100, score))
        return {'score': score, 'findings': findings, 'recommendations': recommendations, 'details': details}
    
    def analyze_platform(self, soup: BeautifulSoup, url: str) -> Dict:
        """Analyze platform presence optimization."""
        findings = []
        recommendations = []
        details = {}
        score = 30  # Base score
        
        html = str(soup).lower()
        
        # Check for platform-specific optimization
        platforms = {
            'YouTube': ['youtube.com', 'youtu.be', 'youtube'],
            'Podcast': ['podcast', 'spotify', 'apple.co'],
            'Reddit': ['reddit.com'],
            'Twitter': ['twitter.com', 'x.com'],
            'LinkedIn': ['linkedin.com'],
            'Instagram': ['instagram.com'],
            'Facebook': ['facebook.com'],
        }
        
        found_platforms = []
        for platform, patterns in platforms.items():
            if any(p in html for p in patterns):
                found_platforms.append(platform)
        
        details['platforms_mentioned'] = found_platforms
        score += len(found_platforms) * 10
        
        if found_platforms:
            findings.append(f"Found references to {', '.join(found_platforms)}")
            recommendations.append({
                'title': f"Great job! Your {', '.join(found_platforms)} presence",
                'description': "Brand mentions on these platforms correlate 3x more with AI visibility. AI systems use these signals to verify your brand exists and is active.",
                'action': "No action needed - your platform presence is helping AI recognize your brand."
            })
        else:
            recommendations.append({
                'title': "Build presence on platforms AI systems cite",
                'description': "AI systems train on content from platforms like YouTube, Reddit, LinkedIn, and Twitter. Being present on these increases your citation chances.",
                'action': "Create profiles on: YouTube (create a channel with videos about your business), LinkedIn (company page + regular posts), Twitter/X (active account), Reddit (relevant subreddits). Brand mentions on these platforms correlate 3x more with AI visibility."
            })
        
        # Check for RSS feed
        rss_link = soup.find('link', type='application/rss+xml')
        if rss_link:
            score += 10
            findings.append("Found RSS feed")
            details['rss'] = True
            recommendations.append({
                'title': "Great job! RSS feed present",
                'description': "An RSS feed helps AI crawlers discover and index your content automatically.",
                'action': "No action needed."
            })
        else:
            recommendations.append({
                'title': "Add an RSS feed to your website",
                'description': "An RSS feed helps AI crawlers discover your content. Without it, new content may not be found quickly.",
                'action': "Add an RSS feed to your website. Most CMS platforms (WordPress, etc.) have this built in. Submit your RSS feed to Google News and other aggregators."
            })
        
        # Check for sitemap reference
        sitemap_link = soup.find('link', attrs={'rel': 'sitemap'})
        if sitemap_link:
            score += 10
            findings.append("Found sitemap link")
            details['sitemap'] = True
            recommendations.append({
                'title': "Great job! Sitemap link present",
                'description': "A sitemap helps search engines index all your pages. This ensures nothing gets missed.",
                'action': "No action needed."
            })
        else:
            recommendations.append({
                'title': "Add a sitemap to help search engines index your site",
                'description': "A sitemap lists all your pages so search engines can find them. Without one, some pages might be missed.",
                'action': "Create a sitemap.xml file listing all your important pages. Submit it to Google Search Console. Most CMS platforms generate this automatically."
            })
        
        score = max(0, min(100, score))
        return {'score': score, 'findings': findings, 'recommendations': recommendations, 'details': details}
    
    def classify_issues(self):
        """Classify findings into issue severity levels."""
        analysis = self.data['analysis']
        
        # Critical issues
        if analysis['technical']['details'].get('robots', '').lower().find('noindex') >= 0:
            self.data['issues']['critical'].append("Page has noindex directive - invisible to search")
        
        if analysis['schema']['score'] < 30:
            self.data['issues']['critical'].append("No structured data - major SEO/GEO weakness")
        
        if analysis['citability']['details'].get('word_count', 0) < 200:
            self.data['issues']['critical'].append(f"Very thin content: {analysis['citability']['details'].get('word_count', 0)} words")
        
        # High priority issues
        if not analysis['technical']['details'].get('canonical'):
            self.data['issues']['high'].append("Missing canonical URL")
        
        if analysis['schema']['details'].get('json_ld_count', 0) == 0:
            self.data['issues']['high'].append("No JSON-LD structured data found")
        
        if analysis['eeat']['details'].get('experience_signals', 0) < 2:
            self.data['issues']['high'].append("Weak experience signals")
        
        # Medium issues
        if analysis['citability']['details'].get('qa_pairs', 0) < 3:
            self.data['issues']['medium'].append("Limited Q&A content - add FAQ sections")
        
        if analysis['technical']['details'].get('images_with_alt', 0) / max(1, analysis['technical']['details'].get('images_total', 1)) < 0.5:
            self.data['issues']['medium'].append("Poor image alt text coverage")
        
        # Low issues
        if not analysis['technical']['details'].get('og_tags', 0) >= 3:
            self.data['issues']['low'].append("Could add more Open Graph tags")
    
    def generate_quick_wins(self):
        """Generate quick win recommendations."""
        analysis = self.data['analysis']
        quick_wins = []
        
        # Schema quick wins
        if analysis['schema']['score'] < 50:
            schema_types = analysis['schema']['details'].get('schema_types', [])
            if 'Organization' not in schema_types:
                quick_wins.append("Add Organization schema to homepage")
            if 'FAQPage' not in schema_types:
                quick_wins.append("Add FAQ schema to question-answer content pages")
        
        # Citability quick wins
        if analysis['citability']['details'].get('qa_pairs', 0) < 3:
            quick_wins.append("Create FAQ section with 5+ questions and answers")
        
        # Technical quick wins
        if not analysis['technical']['details'].get('canonical'):
            quick_wins.append("Add canonical URL to all pages")
        
        if analysis['technical']['details'].get('h1_count', 0) != 1:
            quick_wins.append("Ensure exactly one H1 tag per page")
        
        # E-E-A-T quick wins
        if analysis['eeat']['details'].get('trust_signals', 0) < 3:
            quick_wins.append("Add more trust signals (testimonials, certifications)")
        
        self.data['quick_wins'] = quick_wins[:5]
    
    def calculate_overall_score(self):
        """Calculate weighted GEO score."""
        analysis = self.data['analysis']
        
        breakdown = {}
        total = 0
        
        for category, weight in SCORING_WEIGHTS.items():
            score = analysis[category]['score']
            weighted = score * weight
            breakdown[category] = {
                'score': score,
                'weight': weight,
                'weighted': round(weighted, 1)
            }
            total += weighted
        
        self.data['score_breakdown'] = breakdown
        self.data['score'] = round(total, 1)
        
        # Generate recommendations based on scores
        recommendations = []
        
        if analysis['citability']['score'] < 50:
            recommendations.append("Improve content depth and structure for better AI citation")
        if analysis['brand_authority']['score'] < 50:
            recommendations.append("Build brand presence across social platforms and directories")
        if analysis['eeat']['score'] < 50:
            recommendations.append("Strengthen E-E-A-T signals with author bios and credentials")
        if analysis['technical']['score'] < 50:
            recommendations.append("Fix technical SEO issues - canonical URLs, alt text, heading structure")
        if analysis['schema']['score'] < 50:
            recommendations.append("Implement comprehensive structured data (JSON-LD)")
        if analysis['platform']['score'] < 50:
            recommendations.append("Expand presence on platforms AI systems cite (YouTube, Reddit, etc.)")
        
        self.data['recommendations'] = recommendations
    
    def generate_ai_insights(self) -> str:
        """Generate AI-powered insights using OpenRouter."""
        if not OPENROUTER_API_KEY:
            logger.warning("No OpenRouter API key - using basic insights")
            return self._generate_basic_insights()
        
        try:
            analysis = self.data['analysis']
            
            prompt = f"""You are a GEO SEO expert. Based on this website analysis, provide a comprehensive executive summary and specific action items.

Website: {self.website_url}
Business Type: {self.business_type}

GEO Score: {self.data['score']}/100

Score Breakdown:
- AI Citability: {analysis['citability']['score']}/100
- Brand Authority: {analysis['brand_authority']['score']}/100  
- Content E-E-A-T: {analysis['eeat']['score']}/100
- Technical GEO: {analysis['technical']['score']}/100
- Schema: {analysis['schema']['score']}/100
- Platform: {analysis['platform']['score']}/100

Critical Issues: {len(self.data['issues']['critical'])}
High Priority: {len(self.data['issues']['high'])}

Provide:
1. A 2-3 sentence executive summary
2. The top 5 specific, actionable recommendations with expected impact
3. A 30-day action plan organized by week

Be specific to this website's actual data. Focus on realistic, high-impact changes."""
            
            response = requests.post(
                'https://openrouter.ai/api/v1/chat/completions',
                headers={
                    'Authorization': f'Bearer {OPENROUTER_API_KEY}',
                    'Content-Type': 'application/json',
                    'HTTP-Referer': API_BASE_URL,
                    'X-Title': 'GEO Report'
                },
                json={
                    'model': OPENROUTER_MODEL,
                    'messages': [{'role': 'user', 'content': prompt}],
                    'max_tokens': 800,
                    'temperature': 0.7
                },
                timeout=45
            )
            
            if response.status_code == 200:
                result = response.json()
                message = result['choices'][0]['message']
                content = message.get('content') or message.get('reasoning') or ''
                
                if content:
                    return content
            
            return self._generate_basic_insights()
                
        except Exception as e:
            logger.error(f"AI insights generation failed: {e}")
            return self._generate_basic_insights()
    
    def _generate_basic_insights(self) -> str:
        """Generate basic recommendations without AI."""
        recommendations = []
        analysis = self.data['analysis']
        
        if analysis['citability']['score'] < 50:
            recommendations.append("Add more comprehensive content with Q&A sections")
        
        if analysis['schema']['score'] < 50:
            recommendations.append("Implement JSON-LD structured data markup")
        
        if analysis['eeat']['score'] < 50:
            recommendations.append("Add author bios and credentials to build E-E-A-T")
        
        if analysis['technical']['score'] < 50:
            recommendations.append("Fix technical SEO: add canonical URLs, improve alt text")
        
        if not recommendations:
            recommendations.append("Continue building on your strong GEO foundation")
        
        self.data['recommendations'].extend(recommendations)
        return '\n'.join(f"- {r}" for r in recommendations)
    
    def generate_pdf(self) -> str:
        """Generate comprehensive PDF report."""
        template_path = os.path.join(os.path.dirname(__file__), '..', 'templates', 'report.html')
        
        if not os.path.exists(template_path):
            html_content = self._get_default_template()
        else:
            with open(template_path, 'r') as f:
                html_content = f.read()
        
        template = Template(html_content)
        
        # Get score rating
        score = self.data['score']
        if score >= 90:
            rating = 'Excellent'
        elif score >= 75:
            rating = 'Good'
        elif score >= 60:
            rating = 'Fair'
        elif score >= 40:
            rating = 'Poor'
        else:
            rating = 'Critical'
        
        rendered_html = template.render(
            website_url=self.website_url,
            business_type=self.business_type,
            score=score,
            rating=rating,
            keywords=self.target_keywords,
            analysis=self.data['analysis'],
            issues=self.data['issues'],
            quick_wins=self.data['quick_wins'],
            recommendations=self.data['recommendations'],
            score_breakdown=self.data['score_breakdown'],
            generated_at=datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')
        )
        
        # Convert to PDF using xhtml2pdf
        pdf_buffer = BytesIO()
        pisa_status = pisa.CreatePDF(
            rendered_html,
            dest=pdf_buffer
        )
        
        if pisa_status.err:
            raise Exception("Error generating PDF")
        
        pdf_bytes = pdf_buffer.getvalue()
        
        # Save to file
        filename = f'report_{self.report_id}.pdf'
        filepath = os.path.join(REPORTS_DIR, filename)
        
        with open(filepath, 'wb') as f:
            f.write(pdf_bytes)
        
        return filename
    
    def _get_default_template(self) -> str:
        """Default HTML template for reports."""
        return '''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>GEO SEO Report - {{ website_url }}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 40px; color: #1a1a1a; line-height: 1.6; }
        .header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 3px solid #4F46E5; }
        .logo { font-size: 32px; font-weight: bold; color: #4F46E5; margin-bottom: 10px; }
        .score-circle { width: 150px; height: 150px; border-radius: 50%; background: linear-gradient(135deg, #4F46E5, #7C3AED); display: flex; align-items: center; justify-content: center; margin: 20px auto; }
        .score-text { color: white; font-size: 48px; font-weight: bold; }
        .score-label { color: white; font-size: 14px; }
        .rating { font-size: 24px; font-weight: bold; margin-top: 10px; }
        .rating.excellent { color: #10B981; }
        .rating.good { color: #22C55E; }
        .rating.fair { color: #F59E0B; }
        .rating.poor { color: #EF4444; }
        .rating.critical { color: #DC2626; }
        .section { margin: 30px 0; page-break-inside: avoid; }
        .section h2 { color: #1e40af; border-bottom: 2px solid #4F46E5; padding-bottom: 10px; margin-bottom: 20px; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 20px 0; }
        .card { background: #f8fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #4F46E5; }
        .card h3 { margin-bottom: 10px; color: #1e40af; }
        .score-bar { height: 8px; background: #e2e8f0; border-radius: 4px; margin: 10px 0; overflow: hidden; }
        .score-fill { height: 100%; background: #4F46E5; border-radius: 4px; }
        .score-value { font-weight: bold; color: #4F46E5; }
        .issues { margin: 20px 0; }
        .issue { padding: 10px 15px; margin: 8px 0; border-radius: 4px; }
        .issue.critical { background: #FEE2E2; border-left: 4px solid #DC2626; color: #991B1B; }
        .issue.high { background: #FFEDD5; border-left: 4px solid #EA580C; color: #9A3412; }
        .issue.medium { background: #FEF3C7; border-left: 4px solid #D97706; color: #92400E; }
        .issue.low { background: #E0E7FF; border-left: 4px solid #4F46E5; color: #3730A3; }
        .recommendations { background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .recommendations li { margin: 10px 0; padding-left: 10px; }
        .quick-wins { background: #ECFDF5; padding: 20px; border-radius: 8px; }
        .quick-wins li { margin: 8px 0; }
        .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        th { background: #f8fafc; font-weight: 600; }
        
        /* New detailed recommendation styles */
        .rec-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 15px 0; }
        .rec-title { font-size: 16px; font-weight: bold; color: #1e40af; margin-bottom: 10px; }
        .rec-title.positive { color: #059669; }
        .rec-title.negative { color: #DC2626; }
        .rec-description { color: #475569; margin-bottom: 12px; font-size: 14px; }
        .rec-action { background: #f8fafc; padding: 12px; border-radius: 6px; font-size: 13px; color: #334155; white-space: pre-wrap; }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">GEO SEO Report</div>
        <p style="font-size: 18px; color: #64748b;">{{ website_url }}</p>
        <p style="font-size: 14px; color: #94a3b8;">Business Type: {{ business_type }} | Generated: {{ generated_at }}</p>
        
        <div class="score-circle">
            <div>
                <div class="score-text">{{ score }}</div>
                <div class="score-label">GEO Score</div>
            </div>
        </div>
        <div class="rating {{ rating|lower }}">{{ rating }}</div>
    </div>
    
    <div class="section">
        <h2>Score Breakdown</h2>
        <div style="display: flex; gap: 40px; align-items: flex-start;">
            <!-- Overall Score Circle -->
            <div style="flex: 0 0 180px; text-align: center; padding: 20px;">
                <div style="position: relative; width: 160px; height: 160px; margin: 0 auto;">
                    <!-- Background circle -->
                    <svg width="160" height="160" viewBox="0 0 160 160" style="transform: rotate(-90deg);">
                        <circle cx="80" cy="80" r="70" fill="none" stroke="#e2e8f0" stroke-width="12"/>
                        <!-- Score arc - color based on score -->
                        <circle cx="80" cy="80" r="70" fill="none"
                            stroke="{% if score >= 80 %}#10B981{% elif score >= 60 %}#F59E0B{% else %}#EF4444{% endif %}"
                            stroke-width="12"
                            stroke-linecap="round"
                            stroke-dasharray="{{ score * 4.4 }} 440"
                            style="transition: stroke-dasharray 0.5s ease;"/>
                    </svg>
                    <!-- Score text in center -->
                    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;">
                        <div style="font-size: 42px; font-weight: bold; color: #1e293b; line-height: 1;">{{ score }}</div>
                        <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">GEO Score</div>
                    </div>
                </div>
                <div style="font-size: 20px; font-weight: 600; color: {% if score >= 80 %}#10B981{% elif score >= 60 %}#F59E0B{% else %}#EF4444{% endif %}; margin-top: 10px;">{{ rating }}</div>
            </div>
            
            <!-- Category Bars -->
            <div style="flex: 1; padding: 10px 0;">
                {% set categories = [
                    ('AI Citability', analysis.citability.score),
                    ('Brand Authority', analysis.brand_authority.score),
                    ('E-E-A-T', analysis.eeat.score),
                    ('Technical', analysis.technical.score),
                    ('Schema', analysis.schema.score),
                    ('Platform', analysis.platform.score)
                ] %}
                {% for cat_name, cat_score in categories %}
                <div style="margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span style="font-size: 14px; font-weight: 600; color: #334155;">{{ cat_name }}</span>
                        <span style="font-size: 14px; font-weight: bold; color: {% if cat_score >= 80 %}#10B981{% elif cat_score >= 60 %}#F59E0B{% else %}#EF4444{% endif %};">{{ cat_score }}%</span>
                    </div>
                    <div style="height: 10px; background: #e2e8f0; border-radius: 5px; overflow: hidden;">
                        <div style="height: 100%; width: {{ cat_score }}%; background: {% if cat_score >= 80 %}#10B981{% elif cat_score >= 60 %}#F59E0B{% else %}#EF4444{% endif %}; border-radius: 5px; transition: width 0.5s ease;"></div>
                    </div>
                </div>
                {% endfor %}
            </div>
        </div>
    </div>
    
    {% if issues.critical or issues.high %}
    <div class="section">
        <h2>Priority Issues</h2>
        {% for issue in issues.critical %}
        <div class="issue critical">{{ issue }}</div>
        {% endfor %}
        {% for issue in issues.high %}
        <div class="issue high">{{ issue }}</div>
        {% endfor %}
    </div>
    {% endif %}
    
    {% if quick_wins %}
    <div class="section quick-wins">
        <h2>Quick Wins (This Week)</h2>
        <ul>
        {% for win in quick_wins %}
            <li>{{ win }}</li>
        {% endfor %}
        </ul>
    </div>
    {% endif %}
    
    <div class="section">
        <h2>Detailed Analysis with Solutions</h2>
        
        <h3 style="margin: 20px 0 10px 0;">AI Citability ({{ analysis.citability.score }}/100)</h3>
        {% for rec in analysis.citability.recommendations %}
        <div class="rec-card">
            <div class="rec-title {% if 'Great job' in rec.title %}positive{% else %}negative{% endif %}">{{ rec.title }}</div>
            <div class="rec-description">{{ rec.description }}</div>
            <div class="rec-action">{{ rec.action }}</div>
        </div>
        {% endfor %}
        
        <h3 style="margin: 20px 0 10px 0;">Brand Authority ({{ analysis.brand_authority.score }}/100)</h3>
        {% for rec in analysis.brand_authority.recommendations %}
        <div class="rec-card">
            <div class="rec-title {% if 'Great job' in rec.title %}positive{% else %}negative{% endif %}">{{ rec.title }}</div>
            <div class="rec-description">{{ rec.description }}</div>
            <div class="rec-action">{{ rec.action }}</div>
        </div>
        {% endfor %}
        
        <h3 style="margin: 20px 0 10px 0;">E-E-A-T ({{ analysis.eeat.score }}/100)</h3>
        {% for rec in analysis.eeat.recommendations %}
        <div class="rec-card">
            <div class="rec-title {% if 'Great job' in rec.title %}positive{% else %}negative{% endif %}">{{ rec.title }}</div>
            <div class="rec-description">{{ rec.description }}</div>
            <div class="rec-action">{{ rec.action }}</div>
        </div>
        {% endfor %}
        
        <h3 style="margin: 20px 0 10px 0;">Technical GEO ({{ analysis.technical.score }}/100)</h3>
        {% for rec in analysis.technical.recommendations %}
        <div class="rec-card">
            <div class="rec-title {% if 'Great job' in rec.title %}positive{% else %}negative{% endif %}">{{ rec.title }}</div>
            <div class="rec-description">{{ rec.description }}</div>
            <div class="rec-action">{{ rec.action }}</div>
        </div>
        {% endfor %}
        
        <h3 style="margin: 20px 0 10px 0;">Schema ({{ analysis.schema.score }}/100)</h3>
        {% for rec in analysis.schema.recommendations %}
        <div class="rec-card">
            <div class="rec-title {% if 'Great job' in rec.title %}positive{% else %}negative{% endif %}">{{ rec.title }}</div>
            <div class="rec-description">{{ rec.description }}</div>
            <div class="rec-action">{{ rec.action }}</div>
        </div>
        {% endfor %}
        
        <h3 style="margin: 20px 0 10px 0;">Platform ({{ analysis.platform.score }}/100)</h3>
        {% for rec in analysis.platform.recommendations %}
        <div class="rec-card">
            <div class="rec-title {% if 'Great job' in rec.title %}positive{% else %}negative{% endif %}">{{ rec.title }}</div>
            <div class="rec-description">{{ rec.description }}</div>
            <div class="rec-action">{{ rec.action }}</div>
        </div>
        {% endfor %}
    </div>
    
    <div class="footer">
        <p>Generated by Geo-SaaS | World's Most Advanced GEO SEO Analysis Platform</p>
        <p>Designed by <a href="https://zu-media.co.uk" style="color: #4F46E5; text-decoration: underline;">Zu-Media.co.uk</a></p>
    </div>
</body>
</html>'''
    
    def run(self):
        """Execute full report generation pipeline."""
        logger.info(f"Starting comprehensive GEO report {self.report_id} for {self.website_url}")
        self.update_status('processing')
        
        try:
            # Step 1: Fetch homepage
            logger.info("Step 1: Fetching homepage...")
            soup = self.fetch_page(self.website_url)
            if not soup:
                raise Exception("Failed to fetch website")
            
            # Step 2: Detect business type
            logger.info("Step 2: Detecting business type...")
            self.business_type = self.detect_business_type(soup)
            self.data['business_type'] = self.business_type
            
            # Step 3: Run all analyses
            logger.info("Step 3: Running comprehensive analyses...")
            
            logger.info("  - Analyzing AI citability...")
            self.data['analysis']['citability'] = self.analyze_citability(soup, self.website_url)
            
            logger.info("  - Analyzing brand authority...")
            self.data['analysis']['brand_authority'] = self.analyze_brand_authority(soup, self.website_url)
            
            logger.info("  - Analyzing E-E-A-T...")
            self.data['analysis']['eeat'] = self.analyze_eeat(soup, self.website_url)
            
            logger.info("  - Analyzing technical GEO...")
            self.data['analysis']['technical'] = self.analyze_technical(soup, self.website_url)
            
            logger.info("  - Analyzing schema...")
            self.data['analysis']['schema'] = self.analyze_schema(soup, self.website_url)
            
            logger.info("  - Analyzing platform...")
            self.data['analysis']['platform'] = self.analyze_platform(soup, self.website_url)
            
            # Step 4: Classify issues
            logger.info("Step 4: Classifying issues...")
            self.classify_issues()
            
            # Step 5: Generate quick wins
            logger.info("Step 5: Generating quick wins...")
            self.generate_quick_wins()
            
            # Step 6: Calculate overall score
            logger.info("Step 6: Calculating overall score...")
            self.calculate_overall_score()
            
            # Step 7: Generate AI insights
            logger.info("Step 7: Generating AI insights...")
            self.generate_ai_insights()
            
            # Step 8: Generate PDF
            logger.info("Step 8: Generating PDF report...")
            pdf_filename = self.generate_pdf()
            
            # Update status with results
            redis_client.hset(f'report:{self.report_id}', mapping={
                'status': 'completed',
                'score': self.data['score'],
                'pdf_file': pdf_filename,
                'completed_at': datetime.utcnow().isoformat(),
                'data': json.dumps(self.data)
            })
            
            # Update status in database via API
            try:
                requests.post(
                    f'{API_BASE_URL}/api/reports/{self.report_id}/complete',
                    json={
                        'status': 'completed',
                        'score': self.data['score'],
                        'pdf_filename': pdf_filename,
                    },
                    timeout=10
                )
            except Exception as e:
                logger.warning(f"Failed to update report status in database: {e}")
            
            # Send email notification with PDF attachment
            try:
                if self.user_email:
                    email_data = {
                        'to': self.user_email,
                        'subject': f'Your GEO Report is Ready - Score: {self.data["score"]}/100',
                        'reportId': self.report_id,
                        'websiteUrl': self.website_url,
                        'score': self.data['score'],
                        'pdfFilename': pdf_filename,
                    }
                    requests.post(
                        f'{API_BASE_URL}/api/reports/{self.report_id}/send-email',
                        json=email_data,
                        timeout=10
                    )
            except Exception as e:
                logger.warning(f"Failed to send email notification: {e}")
            
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
    logger.info("Geo SEO Worker started - World Class GEO Reporting")
    
    while True:
        try:
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
