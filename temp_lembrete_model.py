from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from app import db
import os
from cryptography.fernet import Fernet
from sqlalchemy.dialects.postgresql import JSONB

# ... (existing models above)

class Lembrete(db.Model):
    """
    Modelo para lembretes persistentes de projetos
    
    Lembretes ficam ativos até serem explicitamente fechados.
    Múltiplos lembretes podem estar ativos simultaneamente.
    """
    __tablename__ = 'lembretes'
    
    id = db.Column(db.Integer, primary_key=True)
    projeto_id = db.Column(db.Integer, db.ForeignKey('projetos.id',  ondelete='CASCADE'), nullable=False)
    texto = db.Column(db.Text, nullable=False)
    
    # Controle de fechamento
    fechado = db.Column(db.Boolean, default=False, nullable=False)
    fechado_em = db.Column(db.DateTime, nullable=True)
    fechado_por_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    
    # Auditoria
    criado_em = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    criado_por_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    # Relacionamentos
    projeto = db.relationship('Projeto', backref=db.backref('lembretes', lazy='dynamic', cascade='all, delete-orphan'))
    criado_por = db.relationship('User', foreign_keys=[criado_por_id], backref='lembretes_criados')
    fechado_por = db.relationship('User', foreign_keys=[fechado_por_id], backref='lembretes_fechados')
    
    def __repr__(self):
        status = "Fechado" if self.fechado else "Ativo"
        return f'<Lembrete {self.id} - Projeto {self.projeto_id} - {status}>'
    
    def to_dict(self):
        """Serializa o lembrete para JSON"""
        return {
            'id': self.id,
            'projeto_id': self.projeto_id,
            'texto': self.texto,
            'fechado': self.fechado,
            'fechado_em': self.fechado_em.isoformat() if self.fechado_em else None,
            'fechado_por': self.fechado_por.username if self.fechado_por else None,
            'criado_em': self.criado_em.isoformat() if self.criado_em else None,
            'criado_por': self.criado_por.username if self.criado_por else None
        }
