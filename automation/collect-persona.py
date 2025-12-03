#!/usr/bin/env python3
"""
collect-persona.py - C Concept&Dev Automation
Collecte et valide Persona JSON
"""

import json
import sys
from pathlib import Path
from datetime import datetime

class PersonaCollector:
    def __init__(self, source_dir='json-user', output_dir='output'):
        self.source_dir = Path(source_dir)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        
    def find_persona_json(self):
        """Trouve le Persona.json"""
        persona_files = list(self.source_dir.glob('**/Persona.json'))
        persona_files.extend(list(self.source_dir.glob('**/persona.json'))
)        
        if not persona_files:
            print("❌ Aucun Persona.json trouvé")
            return None
        
        persona_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)
        return persona_files[0]
    
    def validate(self, persona_file):
        """Valide structure"""
        try:
            with open(persona_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            required = ['metadata', 'identity', 'lifeStory']
            for key in required:
                if key not in data:
                    print(f"❌ Clé manquante: {key}")
                    return False
            
            print("✅ Persona JSON valide")
            return True
        except Exception as e:
            print(f"❌ Erreur: {e}")
            return False
    
    def collect(self):
        print("="*60)
        print("👤 COLLECTE PERSONA JSON")
        print("="*60)
        
        persona_file = self.find_persona_json()
        if not persona_file:
            return False
        
        print(f"📄 Trouvé: {persona_file}")
        
        if not self.validate(persona_file):
            return False
        
        output = self.output_dir / 'Persona.json'
        with open(persona_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        with open(output, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"✅ Copié vers: {output}")
        print("="*60)
        return True

def main():
    collector = PersonaCollector()
    sys.exit(0 if collector.collect() else 1)

if __name__ == '__main__':
    main()
