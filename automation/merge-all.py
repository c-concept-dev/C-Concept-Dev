#!/usr/bin/env python3
"""merge-all.py - Fusionne Brain + Persona + Knowledge → megasearch.json"""
import json, sys
from pathlib import Path
from datetime import datetime

def merge():
    print("="*60)
    print("🔄 FUSION megasearch.json")
    print("="*60)
    
    output_dir = Path('output')
    brain = output_dir / 'Brain.json'
    persona = output_dir / 'Persona.json'
    knowledge = output_dir / 'knowledge-items.json'
    
    resources = []
    
    # Load knowledge
    if knowledge.exists():
        with open(knowledge, 'r', encoding='utf-8') as f:
            resources = json.load(f)
    
    megasearch = {
        'metadata': {
            'version': '4.0',
            'generated_at': datetime.now().isoformat(),
            'total_resources': len(resources),
            'components': {
                'brain': brain.exists(),
                'persona': persona.exists(),
                'knowledge': len(resources)
            }
        },
        'resources': resources
    }
    
    output = output_dir / 'megasearch.json'
    with open(output, 'w', encoding='utf-8') as f:
        json.dump(megasearch, f, ensure_ascii=False, indent=2)
    
    print(f"✅ megasearch.json créé: {len(resources)} ressources")
    print(f"💾 Taille: {output.stat().st_size / 1024:.1f} KB")
    print("="*60)
    return True

if __name__ == '__main__':
    sys.exit(0 if merge() else 1)
