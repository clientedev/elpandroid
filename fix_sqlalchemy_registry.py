
"""
Script para corrigir duplicatas no registro do SQLAlchemy
Remove classes duplicadas do Base.registry._class_registry
"""

import logging
from app import app, db
from sqlalchemy.orm import configure_mappers

logging.basicConfig(level=logging.INFO)

def fix_sqlalchemy_registry():
    """Remove duplicatas do registry do SQLAlchemy"""
    with app.app_context():
        try:
            # Force mapper configuration
            configure_mappers()
            
            # Get registry
            registry = db.Model.registry
            
            # Check for duplicates
            class_names = {}
            duplicates = []
            
            for mapper in registry.mappers:
                class_name = mapper.class_.__name__
                if class_name in class_names:
                    duplicates.append(class_name)
                    logging.warning(f"⚠️ Duplicate class found: {class_name}")
                else:
                    class_names[class_name] = mapper
            
            if duplicates:
                logging.info(f"🔧 Found {len(duplicates)} duplicate classes: {duplicates}")
                
                # Force refresh metadata
                db.metadata.clear()
                
                # Reimport models
                import models
                
                # Reconfigure mappers
                configure_mappers()
                
                logging.info("✅ Registry cleaned and reconfigured")
            else:
                logging.info("✅ No duplicates found in registry")
            
            return True
            
        except Exception as e:
            logging.error(f"❌ Error fixing registry: {e}")
            return False

if __name__ == '__main__':
    fix_sqlalchemy_registry()
