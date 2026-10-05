"""
Temporary script to add numero_relatorio field to Relatorio model
Since editing models.py directly has text matching issues, this shows the required change
"""

# Add this line after line 149 in models.py (after numero field):
# numero_relatorio = db.Column(db.Integer, nullable=True)  # Per-project numbering

# Add this at the end of Relatorio class (before @property methods):
"""
    # Unique constraint for per-project numbering  
    __table_args__ = (
        db.UniqueConstraint('projeto_id', 'numero_relatorio', name='unique_report_number_per_project'),
    )
"""

print("Update models.py manually by adding the above lines")