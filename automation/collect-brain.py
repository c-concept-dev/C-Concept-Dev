#!/usr/bin/env python3
"""
collect-brain.py - C Concept&Dev Automation
Collecte et valide Brain JSON généré par Clone Interview Pro
"""

import json
import sys
from pathlib import Path
from datetime import datetime

class BrainCollector:
    def __init__(self, source_dir='json-user', output_dir='output'):
        self.source_dir = Path(source_dir)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        
    def find_brain_json(self):
        """Trouve le Brain.json le plus récent"""
        brain_files = list(self.source_dir.glob('**/Brain.json'))
        brain_files.extend(list(self.source_dir.glob('**/brain.json')))
        
        if not brain_files:
            print("❌ Aucun Brain.json trouvé dans", self.source_dir)
            return None
        
        # Trier par date de modification (plus récent en premier)
        brain_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)
        return brain_files[0]
    
    def validate_brain_json(self, brain_file):
        """Valide la structure du Brain JSON"""
        try:
            with open(brain_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Vérifications critiques
            required_keys = ['metadata', 'personalityProfile']
            for key in required_keys:
                if key not in data:
                    print(f"❌ Clé manquante: {key}")
                    return False
            
            # Vérifier Big Five
            big_five = data['personalityProfile'].get('bigFive', {})
            required_traits = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism']
            
            for trait in required_traits:
                if trait not in big_five:
                    print(f"❌ Trait Big Five manquant: {trait}")
                    return False
                    
                score = big_five[trait]
                if not (0 <= score <= 100):
                    print(f"❌ Score invalide pour {trait}: {score} (doit être 0-100)")
                    return False
            
            # Vérifier Schwartz Values
            schwartz = data['personalityProfile'].get('schwartzValues', [])
            if len(schwartz) != 10:
                print(f"⚠️ Schwartz Values: {len(schwartz)}/10 valeurs (devrait être 10)")
            
            print("✅ Brain JSON valide")
            return True
            
        except json.JSONDecodeError as e:
            print(f"❌ Erreur JSON: {e}")
            return False
        except Exception as e:
            print(f"❌ Erreur validation: {e}")
            return False
    
    def collect(self):
        """Collecte et copie le Brain JSON validé"""
        print("="*60)
        print("🧠 COLLECTE BRAIN JSON")
        print("="*60)
        print()
        
        # Trouver Brain.json
        brain_file = self.find_brain_json()
        if not brain_file:
            return False
        
        print(f"📄 Trouvé: {brain_file}")
        print(f"📅 Modifié: {datetime.fromtimestamp(brain_file.stat().st_mtime)}")
        print(f"💾 Taille: {brain_file.stat().st_size / 1024:.1f} KB")
        print()
        
        # Valider
        if not self.validate_brain_json(brain_file):
            return False
        
        # Copier vers output
        output_file = self.output_dir / 'Brain.json'
        with open(brain_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"✅ Copié vers: {output_file}")
        print()
        
        # Stats
        big_five = data['personalityProfile']['bigFive']
        print("📊 Big Five:")
        for trait, score in big_five.items():
            bar = '█' * int(score / 5)
            print(f"  {trait:20s}: {score:3.0f}% {bar}")
        
        print()
        print("="*60)
        print("✅ COLLECTE TERMINÉE")
        print("="*60)
        
        return True

def main():
    collector = BrainCollector()
    success = collector.collect()
    sys.exit(0 if success else 1)

if __name__ == '__main__':
    main()
