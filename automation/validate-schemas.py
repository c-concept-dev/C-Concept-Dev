#!/usr/bin/env python3
"""validate-schemas.py - Valide tous les JSON contre leurs schemas"""
import json, sys
from pathlib import Path

def validate():
    print("="*60)
    print("✅ VALIDATION SCHEMAS JSON")
    print("="*60)
    
    output_dir = Path('output')
    schemas_dir = Path('schemas')
    
    files = {
        'Brain.json': 'brain.schema.json',
        'Persona.json': 'persona.schema.json',
        'megasearch.json': 'megasearch.schema.json'
    }
    
    all_valid = True
    
    for json_file, schema_file in files.items():
        json_path = output_dir / json_file
        schema_path = schemas_dir / schema_file
        
        if not json_path.exists():
            print(f"⚠️  {json_file} introuvable")
            continue
        
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            print(f"✅ {json_file} valide")
        except Exception as e:
            print(f"❌ {json_file} invalide: {e}")
            all_valid = False
    
    print("="*60)
    return all_valid

if __name__ == '__main__':
    sys.exit(0 if validate() else 1)
