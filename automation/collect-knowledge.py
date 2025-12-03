#!/usr/bin/env python3
"""collect-knowledge.py - Scanne knowledge/ et génère items JSON"""
import json, sys
from pathlib import Path

class KnowledgeCollector:
    def __init__(self, knowledge_dir='knowledge', output='output/knowledge-items.json'):
        self.knowledge_dir = Path(knowledge_dir)
        self.output = Path(output)
        self.items = []
        
    def scan(self):
        print("📚 Scan knowledge/...")
        if not self.knowledge_dir.exists():
            print("⚠️  Dossier knowledge/ introuvable")
            return False
        
        json_files = list(self.knowledge_dir.glob('**/*.json'))
        print(f"Trouvés: {len(json_files)} fichiers JSON")
        
        for jf in json_files:
            try:
                with open(jf, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        self.items.extend(data)
                    elif isinstance(data, dict):
                        self.items.append(data)
            except: pass
        
        with open(self.output, 'w', encoding='utf-8') as f:
            json.dump(self.items, f, ensure_ascii=False, indent=2)
        
        print(f"✅ {len(self.items)} items → {self.output}")
        return True

if __name__ == '__main__':
    sys.exit(0 if KnowledgeCollector().scan() else 1)
