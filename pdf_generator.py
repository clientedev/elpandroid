import os
import io
from datetime import datetime
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm, mm
from reportlab.lib.colors import black, blue, orange, white, gray
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle, PageBreak, KeepTogether
from reportlab.platypus.flowables import HRFlowable
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from flask import current_app, Flask
from PIL import Image as PILImage

class ReportPDFGenerator:
    def __init__(self):
        self.styles = getSampleStyleSheet()
        self.setup_custom_styles()
    
    def setup_custom_styles(self):
        """Setup custom styles for the PDF following exact template format"""
        # Main title style
        self.styles.add(ParagraphStyle(
            name='MainTitle',
            parent=self.styles['Title'],
            fontSize=16,
            spaceAfter=30,
            textColor=black,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        ))
        
        # Date in header style
        self.styles.add(ParagraphStyle(
            name='HeaderDate',
            parent=self.styles['Normal'],
            fontSize=10,
            textColor=black,
            alignment=TA_RIGHT,
            fontName='Helvetica'
        ))
        
        # Section header style
        self.styles.add(ParagraphStyle(
            name='SectionHeader',
            parent=self.styles['Heading1'],
            fontSize=12,
            spaceAfter=6,
            spaceBefore=12,
            textColor=black,
            leftIndent=0,
            fontName='Helvetica-Bold'
        ))
        
        # Info style
        self.styles.add(ParagraphStyle(
            name='Info',
            parent=self.styles['Normal'],
            fontSize=10,
            spaceAfter=3,
            leftIndent=0,
            fontName='Helvetica'
        ))
        
        # Photo caption style
        self.styles.add(ParagraphStyle(
            name='PhotoCaption',
            parent=self.styles['Normal'],
            fontSize=9,
            spaceAfter=6,
            alignment=TA_CENTER,
            textColor=black,
            fontName='Helvetica'
        ))
        
        # Checklist styles
        self.styles.add(ParagraphStyle(
            name='ChecklistHeader',
            parent=self.styles['Heading2'],
            fontSize=11,
            spaceAfter=8,
            spaceBefore=15,
            textColor=black,
            fontName='Helvetica-Bold',
            leftIndent=0
        ))
        
        self.styles.add(ParagraphStyle(
            name='ChecklistItem',
            parent=self.styles['Normal'],
            fontSize=10,
            spaceAfter=4,
            leftIndent=20,
            fontName='Helvetica'
        ))
        
        self.styles.add(ParagraphStyle(
            name='ChecklistObservation',
            parent=self.styles['Normal'],
            fontSize=9,
            spaceAfter=6,
            leftIndent=40,
            textColor=gray,
            fontName='Helvetica-Oblique'
        ))
        
        # Footer company style
        self.styles.add(ParagraphStyle(
            name='FooterCompany',
            parent=self.styles['Normal'],
            fontSize=9,
            textColor=black,
            alignment=TA_LEFT,
            fontName='Helvetica-Bold'
        ))
        
        # Footer info style
        self.styles.add(ParagraphStyle(
            name='FooterInfo',
            parent=self.styles['Normal'],
            fontSize=8,
            textColor=black,
            alignment=TA_LEFT,
            fontName='Helvetica'
        ))
        
        # Footer right style
        self.styles.add(ParagraphStyle(
            name='FooterRight',
            parent=self.styles['Normal'],
            fontSize=8,
            textColor=black,
            alignment=TA_RIGHT,
            fontName='Helvetica'
        ))
    
    def generate_visit_report_pdf(self, relatorio, output_path=None):
        """Generate PDF report following exact template format"""
        if not output_path:
            output_path = f"relatorio_{relatorio.numero}.pdf"
        
        # Create PDF document with exact margins from template
        doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            rightMargin=40,
            leftMargin=40,
            topMargin=40,
            bottomMargin=80  # Space for footer
        )
        
        # Build PDF content
        story = []
        
        # Header section (title and date)
        self._add_template_header(story, relatorio)
        
        # Report section
        self._add_template_report_section(story, relatorio)
        
        # Company and project info
        self._add_template_company_info(story, relatorio)
        
        # Items observados section
        self._add_template_items_section(story, relatorio)
        
        # Photos grid (2x2 per page)
        if relatorio.fotos:
            self._add_template_photos_grid(story, relatorio.fotos)
        
        # Signatures section
        self._add_template_signatures(story, relatorio)
        
        # Build PDF with custom footer
        doc.build(story, onFirstPage=self._add_template_footer, onLaterPages=self._add_template_footer)
    
    def generate_report_pdf(self, relatorio, fotos=None):
        """Generate clean professional PDF with only filled data"""
        buffer = io.BytesIO()
        
        # Create document with A4 page size
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=2*cm,
            leftMargin=2*cm,
            topMargin=2*cm,
            bottomMargin=2*cm
        )
        
        # Build story (content)
        story = []
        
        # 1. PROFESSIONAL ELP HEADER
        self._add_professional_elp_header(story, relatorio)
        
        # 2. ONLY FILLED REPORT DATA
        self._add_filled_report_info(story, relatorio)
        
        # 3. CHECKLIST REMOVED FROM PDF AS PER REQUIREMENT
        # Checklist should not appear in PDF - only in web view
        # self._add_clean_checklist(story, relatorio)
        
        # 4. PHOTOS IF ANY
        if fotos:
            self._add_clean_photos(story, fotos)
        
        # Report section
        story.append(Paragraph("Relatório", self.styles['SectionHeader']))
        
        # Date info
        date_info = f"Data<br/>{relatorio.data_relatorio.strftime('%d/%m/%Y %H:%M:%S') if relatorio.data_relatorio else 'Não informada'}"
        story.append(Paragraph(date_info, self.styles['Info']))
        story.append(Spacer(1, 15))
        
        # General data section
        story.append(Paragraph("Dados gerais", self.styles['SectionHeader']))
        
        # Company and project info
        projeto_nome = relatorio.projeto.nome if relatorio.projeto else "Não informado"
        autor_nome = relatorio.autor.nome_completo if relatorio.autor else "Não informado"
        
        general_data = Table([
            ['Empresa', 'Empreendimento'],
            [autor_nome, projeto_nome]
        ], colWidths=[9*cm, 9*cm])
        
        general_data.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('GRID', (0, 0), (-1, -1), 0.5, black),
        ]))
        
        story.append(general_data)
        story.append(Spacer(1, 20))
        
        # Content section
        if relatorio.conteudo:
            story.append(Paragraph("Observações", self.styles['SectionHeader']))
            story.append(Paragraph(relatorio.conteudo, self.styles['Info']))
            story.append(Spacer(1, 15))
        
        # Photos section
        if fotos:
            story.append(Paragraph("Itens observados", self.styles['SectionHeader']))
            story.append(Spacer(1, 10))
            
            # Process photos in pairs (2 per row)
            photo_pairs = [fotos[i:i+2] for i in range(0, len(fotos), 2)]
            
            for pair in photo_pairs:
                photo_row = []
                caption_row = []
                
                for foto in pair:
                    # Try to load image
                    try:
                        from flask import current_app
                        upload_folder = current_app.config.get('UPLOAD_FOLDER', 'uploads') if current_app else 'uploads'
                        image_path = os.path.join(upload_folder, foto.filename)
                        
                        if os.path.exists(image_path):
                            # Resize image to fit in PDF
                            img = Image(image_path, width=8*cm, height=6*cm)
                            photo_row.append(img)
                        else:
                            # Placeholder for missing image
                            photo_row.append(Paragraph("Imagem não encontrada", self.styles['PhotoCaption']))
                        
                        # Add caption
                        caption_row.append(Paragraph(foto.legenda or "Sem legenda", self.styles['PhotoCaption']))
                        
                    except Exception:
                        photo_row.append(Paragraph("Erro ao carregar imagem", self.styles['PhotoCaption']))
                        caption_row.append(Paragraph(foto.legenda or "Sem legenda", self.styles['PhotoCaption']))
                
                # Fill remaining cells if odd number of photos
                while len(photo_row) < 2:
                    photo_row.append('')
                    caption_row.append('')
                
                # Create photo table
                photo_table = Table([photo_row, caption_row], colWidths=[9*cm, 9*cm])
                photo_table.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('FONTSIZE', (0, 1), (-1, 1), 9),
                ]))
                
                story.append(photo_table)
                story.append(Spacer(1, 15))
        
        # Simple ELP footer (removed signatures as requested)
        story.append(Spacer(1, 30))
        
        # ELP contact footer
        footer_info = Table([[
            'ELP CONSULTORIA E ENGENHARIA - Especializada em Fachadas de Obras e Empreendimentos Verticais\n'
            '📞 (11) 9999-9999 | 📧 contato@elpconsultoria.com.br'
        ]], colWidths=[18*cm])
        footer_info.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), '#f8f9fa'),
            ('BORDER', (0, 0), (-1, -1), 1, '#20c1e8'),  # ELP cyan border
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 15),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 15),
            ('TEXTCOLOR', (0, 0), (-1, -1), '#343a40'),  # ELP dark text
        ]))
        story.append(footer_info)
        
        # 5. PROFESSIONAL FOOTER
        self._add_professional_footer(story)
        
        # Build PDF
        doc.build(story)
        buffer.seek(0)
        return buffer.getvalue()
    
    def _add_professional_elp_header(self, story, relatorio):
        """Professional ELP header with logo and company info"""
        try:
            # Company header with logo
            logo_path = 'static/logo_elp_new.jpg'
            if os.path.exists(logo_path):
                logo_img = Image(logo_path, width=3.5*cm, height=1.8*cm)
                
                # Create header table with logo and company info
                header_data = [
                    [logo_img, 
                     Paragraph("<b>ELP CONSULTORIA E ENGENHARIA</b><br/>Especializada em Fachadas e Estruturas<br/>📞 (11) 9999-9999 | 📧 contato@elp.com.br", self.styles['Normal']),
                     f"<b>Relatório: {relatorio.numero}</b><br/>{relatorio.data_relatorio.strftime('%d/%m/%Y') if relatorio.data_relatorio else ''}"
                    ]
                ]
                
                header_table = Table(header_data, colWidths=[4*cm, 10*cm, 4*cm])
                header_table.setStyle(TableStyle([
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('ALIGN', (0, 0), (0, 0), 'CENTER'),
                    ('ALIGN', (1, 0), (1, 0), 'LEFT'), 
                    ('ALIGN', (2, 0), (2, 0), 'RIGHT'),
                    ('FONTSIZE', (1, 0), (1, 0), 10),
                    ('FONTSIZE', (2, 0), (2, 0), 9),
                    ('BACKGROUND', (0, 0), (-1, -1), '#f8f9fa'),
                    ('BORDER', (0, 0), (-1, -1), 2, '#20c1e8'),
                    ('TOPPADDING', (0, 0), (-1, -1), 12),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
                    ('LEFTPADDING', (0, 0), (-1, -1), 8),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                ]))
                
                story.append(header_table)
                story.append(Spacer(1, 20))
                
        except Exception as e:
            print(f"Header error: {e}")
            # Fallback simple header
            story.append(Paragraph(f"<b>ELP CONSULTORIA E ENGENHARIA - RELATÓRIO {relatorio.numero}</b>", self.styles['Title']))
            story.append(Spacer(1, 20))
    
    def _add_filled_report_info(self, story, relatorio):
        """Add only filled report information"""
        story.append(Paragraph("INFORMAÇÕES DO RELATÓRIO", self.styles['SectionHeader']))
        
        # Only show filled data
        filled_data = []
        
        if relatorio.numero:
            filled_data.append(['Número:', relatorio.numero])
        if relatorio.titulo:
            filled_data.append(['Título:', relatorio.titulo])
        if relatorio.data_relatorio:
            filled_data.append(['Data:', relatorio.data_relatorio.strftime('%d/%m/%Y às %H:%M')])
        if relatorio.status:
            filled_data.append(['Status:', relatorio.status])
        if relatorio.projeto and relatorio.projeto.nome:
            filled_data.append(['Projeto:', relatorio.projeto.nome])
        if relatorio.projeto and relatorio.projeto.endereco:
            filled_data.append(['Endereço:', relatorio.projeto.endereco])
        
        # Show full address instead of GPS coordinates
        if relatorio.projeto and hasattr(relatorio.projeto, 'latitude') and hasattr(relatorio.projeto, 'longitude'):
            if relatorio.projeto.latitude and relatorio.projeto.longitude and not relatorio.projeto.endereco:
                # Use formatted address from GPS
                endereco_gps = self._get_address_from_coordinates(relatorio.projeto.latitude, relatorio.projeto.longitude)
                filled_data.append(['Localização:', endereco_gps])
        if relatorio.autor and relatorio.autor.nome_completo:
            filled_data.append(['Responsável:', relatorio.autor.nome_completo])
        
        if filled_data:
            info_table = Table(filled_data, colWidths=[4*cm, 14*cm])
            info_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), '#20c1e8'),
                ('BACKGROUND', (1, 0), (1, -1), '#f0f9ff'),
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('TEXTCOLOR', (0, 0), (0, -1), white),
                ('TEXTCOLOR', (1, 0), (1, -1), '#343a40'),
                ('FONTSIZE', (0, 0), (-1, -1), 11),
                ('GRID', (0, 0), (-1, -1), 1, '#20c1e8'),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ]))
            story.append(info_table)
        
        story.append(Spacer(1, 20))
    
    def _add_clean_checklist(self, story, relatorio):
        """Add only checked checklist items with observations"""
        if not relatorio.conteudo:
            return
            
        story.append(Paragraph("ITENS VERIFICADOS", self.styles['SectionHeader']))
        
        # Parse content for checklist items
        content_lines = relatorio.conteudo.split('\n')
        checklist_items = []
        current_observation = ""
        
        for line in content_lines:
            line = line.strip()
            if line.startswith('✓') or line.startswith('○'):
                # Process previous item observation
                if current_observation:
                    if checklist_items:
                        checklist_items[-1]['observation'] = current_observation.strip()
                    current_observation = ""
                
                # Add new checklist item
                status = "CONFORME" if line.startswith('✓') else "NÃO CONFORME"
                item_text = line[1:].strip()
                
                # Only add if item has actual content
                if item_text and item_text != "":
                    checklist_items.append({
                        'status': status,
                        'text': item_text,
                        'observation': ""
                    })
                    
            elif line.startswith('Observações:') or line.startswith('Obs:'):
                current_observation = line.replace('Observações:', '').replace('Obs:', '').strip()
            elif current_observation and line:
                current_observation += " " + line
        
        # Add final observation
        if current_observation and checklist_items:
            checklist_items[-1]['observation'] = current_observation.strip()
        
        # Render only items that were checked (with ✓)
        for item in checklist_items:
            if item['text'] and item['status'] == 'CONFORME':  # Only show checked items
                
                # Create simple item table without status
                item_data = [
                    ['ITEM VERIFICADO', item['text']]
                ]
                
                # Add observation if exists
                if item['observation']:
                    item_data.append(['OBSERVAÇÃO', item['observation']])
                
                item_table = Table(item_data, colWidths=[3*cm, 15*cm])
                item_table.setStyle(TableStyle([
                    # Header row
                    ('BACKGROUND', (0, 0), (0, 0), '#20c1e8'),
                    ('BACKGROUND', (1, 0), (1, 0), '#f0f9ff'),
                    ('TEXTCOLOR', (0, 0), (0, 0), white),
                    ('TEXTCOLOR', (1, 0), (1, 0), '#343a40'),
                    # Observation row if exists
                    ('BACKGROUND', (0, 1), (0, 1), '#343a40') if item['observation'] else ('BACKGROUND', (0, 1), (0, 1), white),
                    ('BACKGROUND', (1, 1), (1, 1), '#f8f9fa') if item['observation'] else ('BACKGROUND', (1, 1), (1, 1), white),
                    ('TEXTCOLOR', (0, 1), (0, 1), white) if item['observation'] else ('TEXTCOLOR', (0, 1), (0, 1), black),
                    ('TEXTCOLOR', (1, 1), (1, 1), '#343a40') if item['observation'] else ('TEXTCOLOR', (1, 1), (1, 1), black),
                    # General styling
                    ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
                    ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
                    ('FONTSIZE', (0, 0), (-1, -1), 10),
                    ('GRID', (0, 0), (-1, -1), 1, '#20c1e8'),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('TOPPADDING', (0, 0), (-1, -1), 8),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                ]))
                
                story.append(item_table)
                story.append(Spacer(1, 10))
        
        # If no checklist items found, show message
        if not checklist_items:
            no_items = Table([['Nenhum item de checklist foi preenchido neste relatório.']], colWidths=[18*cm])
            no_items.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), '#f8f9fa'),
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Oblique'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('TOPPADDING', (0, 0), (-1, -1), 15),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 15),
            ]))
            story.append(no_items)
        
        story.append(Spacer(1, 20))
    
    def _add_clean_photos(self, story, fotos):
        """Add photos in professional format - one per row with proper spacing"""
        if not fotos:
            return
            
        story.append(Paragraph(f"REGISTRO FOTOGRÁFICO ({len(fotos)} fotos)", self.styles['SectionHeader']))
        story.append(Spacer(1, 10))
        
        # Process photos individually for better formatting
        for foto in fotos:
            try:
                foto_path = os.path.join('uploads', foto.filename)
                if os.path.exists(foto_path):
                    # Create image with proper size
                    img = Image(foto_path, width=8*cm, height=6*cm)
                    
                    # Create photo info table
                    photo_info = [
                        [f"Foto #{foto.ordem}", foto.legenda or 'Sem legenda']
                    ]
                    
                    # Photo table with image and caption
                    photo_table = Table([
                        [img, ''],  # Image in left column, empty right
                        ['', '']    # Empty row for spacing
                    ], colWidths=[8.5*cm, 9.5*cm], rowHeights=[6.5*cm, 0.5*cm])
                    
                    photo_table.setStyle(TableStyle([
                        ('VALIGN', (0, 0), (0, 0), 'TOP'),
                        ('ALIGN', (0, 0), (0, 0), 'CENTER'),
                        ('LEFTPADDING', (0, 0), (-1, -1), 0),
                        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                        ('TOPPADDING', (0, 0), (-1, -1), 0),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
                    ]))
                    
                    # Caption table
                    caption_table = Table(photo_info, colWidths=[3*cm, 15*cm])
                    caption_table.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (0, 0), '#20c1e8'),
                        ('BACKGROUND', (1, 0), (1, 0), '#f0f9ff'),
                        ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold'),
                        ('FONTNAME', (1, 0), (1, 0), 'Helvetica'),
                        ('TEXTCOLOR', (0, 0), (0, 0), white),
                        ('TEXTCOLOR', (1, 0), (1, 0), '#343a40'),
                        ('FONTSIZE', (0, 0), (-1, -1), 10),
                        ('GRID', (0, 0), (-1, -1), 1, '#20c1e8'),
                        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                        ('TOPPADDING', (0, 0), (-1, -1), 8),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                    ]))
                    
                    story.append(photo_table)
                    story.append(caption_table)
                    story.append(Spacer(1, 20))
                    
            except Exception as e:
                print(f"Photo error: {e}")
                continue
    
    def _add_professional_footer(self, story):
        """Clean professional footer"""
        story.append(Spacer(1, 30))
        
        footer_table = Table([[
            f"ELP Consultoria e Engenharia | Fachadas e Estruturas\n"
            f"Telefone: (11) 9999-9999 | E-mail: contato@elp.com.br\n"
            f"Relatório gerado em {datetime.now().strftime('%d/%m/%Y às %H:%M')}"
        ]], colWidths=[18*cm])
        
        footer_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), '#f8f9fa'),
            ('BORDER', (0, 0), (-1, -1), 1, '#20c1e8'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 12),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
            ('TEXTCOLOR', (0, 0), (-1, -1), '#343a40'),
        ]))
        
        story.append(footer_table)
    
    def _get_address_from_coordinates(self, lat, lng):
        """Convert GPS coordinates to formatted address"""
        try:
            import requests
            import json
            
            # Use Nominatim (free) for reverse geocoding
            url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lng}&addressdetails=1"
            headers = {'User-Agent': 'ELP-Sistema-Relatorios/1.0'}
            
            response = requests.get(url, headers=headers, timeout=5)
            if response.status_code == 200:
                data = response.json()
                address = data.get('address', {})
                
                # Build formatted address
                parts = []
                if address.get('road'):
                    parts.append(address['road'])
                if address.get('house_number'):
                    parts[-1] += f", {address['house_number']}"
                if address.get('suburb') or address.get('neighbourhood'):
                    parts.append(address.get('suburb') or address.get('neighbourhood'))
                if address.get('city'):
                    parts.append(address['city'])
                if address.get('state'):
                    parts.append(address['state'])
                
                if parts:
                    return " - ".join(parts)
            
        except Exception as e:
            print(f"Geocoding error: {e}")
        
        # Fallback to coordinates if geocoding fails
        return f"Lat: {lat:.6f}, Lng: {lng:.6f}"
    
    def _add_complete_elp_header(self, story, relatorio):
        """Add professional ELP header with logo and company info"""
        try:
            # Try to load ELP logo
            logo_path = 'static/logo_elp_new.jpg'
            if os.path.exists(logo_path):
                logo_img = Image(logo_path, width=4*cm, height=2*cm)
                
                company_info = [
                    Paragraph("<b>ELP CONSULTORIA E ENGENHARIA</b>", self.styles['CompanyHeader']),
                    Paragraph("Serviços Especializados em Fachadas e Estruturas", self.styles['CompanySubheader']),
                    Paragraph("📞 contato@elp.com.br", self.styles['CompanyContact'])
                ]
                
                header_table = Table([
                    [logo_img, company_info, f'Relatório: {relatorio.numero}']
                ], colWidths=[4*cm, 10*cm, 4*cm])
                
                header_table.setStyle(TableStyle([
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('ALIGN', (0, 0), (0, 0), 'CENTER'),
                    ('ALIGN', (1, 0), (1, 0), 'LEFT'),
                    ('ALIGN', (2, 0), (2, 0), 'RIGHT'),
                    ('BACKGROUND', (0, 0), (-1, -1), '#f8f9fa'),
                    ('BORDER', (0, 0), (-1, -1), 2, '#20c1e8'),
                    ('TOPPADDING', (0, 0), (-1, -1), 15),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 15),
                ]))
                
                story.append(header_table)
                story.append(Spacer(1, 20))
        except Exception as e:
            print(f"Header error: {e}")
    
    def _add_all_report_details(self, story, relatorio):
        """Add ALL report details in professional format"""
        story.append(Paragraph("📋 INFORMAÇÕES COMPLETAS DO RELATÓRIO", self.styles['SectionHeader']))
        
        # Complete report data
        report_data = [
            ['Número:', relatorio.numero or 'N/A'],
            ['Título:', relatorio.titulo or 'N/A'], 
            ['Data Criação:', relatorio.data_relatorio.strftime('%d/%m/%Y %H:%M') if relatorio.data_relatorio else 'N/A'],
            ['Data Atualização:', relatorio.updated_at.strftime('%d/%m/%Y %H:%M') if hasattr(relatorio, 'updated_at') and relatorio.updated_at else 'N/A'],
            ['Status:', relatorio.status or 'N/A'],
            ['Tipo:', getattr(relatorio, 'tipo', 'Relatório de Obra')],
        ]
        
        report_table = Table(report_data, colWidths=[4*cm, 14*cm])
        report_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), '#20c1e8'),  # ELP cyan
            ('BACKGROUND', (1, 0), (1, -1), '#f0f9ff'),  # Light blue
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('TEXTCOLOR', (0, 0), (0, -1), white),
            ('TEXTCOLOR', (1, 0), (1, -1), '#343a40'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('GRID', (0, 0), (-1, -1), 1, '#343a40'),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        
        story.append(report_table)
        story.append(Spacer(1, 15))
    
    def _add_complete_project_visit_data(self, story, relatorio):
        """Add complete project and visit information"""
        # Project section
        story.append(Paragraph("🏗️ INFORMAÇÕES DA OBRA", self.styles['SectionHeader']))
        
        projeto = relatorio.projeto
        if projeto:
            project_data = [
                ['Número Projeto:', projeto.numero or 'N/A'],
                ['Nome:', projeto.nome or 'N/A'],
                ['Tipo Obra:', getattr(projeto, 'tipo_obra', 'N/A')],
                ['Endereço:', projeto.endereco or 'N/A'],
                ['Responsável:', projeto.responsavel.nome_completo if projeto.responsavel else 'N/A'],
                ['Status:', projeto.status or 'N/A'],
                ['Data Início:', projeto.data_inicio.strftime('%d/%m/%Y') if projeto.data_inicio else 'N/A'],
                ['Previsão Fim:', projeto.data_previsao_fim.strftime('%d/%m/%Y') if projeto.data_previsao_fim else 'N/A'],
            ]
            
            # Add GPS coordinates if available
            if hasattr(projeto, 'latitude') and hasattr(projeto, 'longitude') and projeto.latitude and projeto.longitude:
                project_data.append(['📍 GPS:', f"{projeto.latitude:.6f}, {projeto.longitude:.6f}"])
            
            project_table = Table(project_data, colWidths=[4*cm, 14*cm])
            project_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), '#343a40'),  # Dark gray
                ('BACKGROUND', (1, 0), (1, -1), '#f8f9fa'),  # Light gray
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('TEXTCOLOR', (0, 0), (0, -1), white),
                ('TEXTCOLOR', (1, 0), (1, -1), '#343a40'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('GRID', (0, 0), (-1, -1), 1, '#343a40'),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ]))
            
            story.append(project_table)
        
        story.append(Spacer(1, 15))
    
    def _add_complete_author_approval_info(self, story, relatorio):
        """Add complete author and approval information"""
        story.append(Paragraph("👤 AUTORIA E APROVAÇÃO", self.styles['SectionHeader']))
        
        auth_data = []
        
        # Author information
        if relatorio.autor:
            auth_data.extend([
                ['Autor:', relatorio.autor.nome_completo],
                ['E-mail Autor:', relatorio.autor.email if relatorio.autor.email else 'N/A'],
                ['Função:', 'Master' if relatorio.autor.is_master else 'Usuário'],
            ])
        
        # Approval information
        if hasattr(relatorio, 'aprovador_id') and relatorio.aprovador_id:
            from models import User
            aprovador = User.query.get(relatorio.aprovador_id)
            if aprovador:
                auth_data.extend([
                    ['Aprovador:', aprovador.nome_completo],
                    ['Data Aprovação:', relatorio.data_aprovacao.strftime('%d/%m/%Y %H:%M') if hasattr(relatorio, 'data_aprovacao') and relatorio.data_aprovacao else 'N/A'],
                ])
        
        if auth_data:
            auth_table = Table(auth_data, colWidths=[4*cm, 14*cm])
            auth_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), '#28a745'),  # Green
                ('BACKGROUND', (1, 0), (1, -1), '#d4edda'),  # Light green
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('TEXTCOLOR', (0, 0), (0, -1), white),
                ('TEXTCOLOR', (1, 0), (1, -1), '#155724'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('GRID', (0, 0), (-1, -1), 1, '#28a745'),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ]))
            
            story.append(auth_table)
        
        story.append(Spacer(1, 15))
    
    def _add_all_content_sections(self, story, relatorio):
        """Add ALL content sections with enhanced formatting"""
        story.append(Paragraph("📝 CONTEÚDO COMPLETO DO RELATÓRIO", self.styles['SectionHeader']))
        
        if relatorio.conteudo:
            # Enhanced content formatting
            content_lines = relatorio.conteudo.split('\n')
            
            for line in content_lines:
                if line.strip():
                    # Format different types of content
                    if line.strip().startswith('CHECKLIST'):
                        # Checklist header
                        header_table = Table([[line.strip()]], colWidths=[18*cm])
                        header_table.setStyle(TableStyle([
                            ('BACKGROUND', (0, 0), (-1, -1), '#20c1e8'),
                            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
                            ('TEXTCOLOR', (0, 0), (-1, -1), white),
                            ('FONTSIZE', (0, 0), (-1, -1), 12),
                            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                            ('TOPPADDING', (0, 0), (-1, -1), 10),
                            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
                        ]))
                        story.append(header_table)
                        story.append(Spacer(1, 8))
                        
                    elif line.strip().startswith('✓') or line.strip().startswith('○'):
                        # Checklist items with enhanced formatting
                        status = "✅ CONFORME" if line.startswith('✓') else "❌ NÃO CONFORME"
                        item_text = line[1:].strip()
                        
                        status_color = '#28a745' if line.startswith('✓') else '#dc3545'
                        bg_color = '#d4edda' if line.startswith('✓') else '#f8d7da'
                        
                        item_table = Table([
                            ['STATUS', status],
                            ['ITEM', item_text]
                        ], colWidths=[3*cm, 15*cm])
                        
                        item_table.setStyle(TableStyle([
                            ('BACKGROUND', (0, 0), (0, 0), status_color),
                            ('BACKGROUND', (1, 0), (1, 0), bg_color),
                            ('BACKGROUND', (0, 1), (0, 1), '#343a40'),
                            ('BACKGROUND', (1, 1), (1, 1), '#f8f9fa'),
                            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
                            ('TEXTCOLOR', (0, 0), (0, 0), white),
                            ('TEXTCOLOR', (1, 0), (1, 0), status_color),
                            ('TEXTCOLOR', (0, 1), (0, 1), white),
                            ('TEXTCOLOR', (1, 1), (1, 1), '#343a40'),
                            ('FONTSIZE', (0, 0), (-1, -1), 10),
                            ('GRID', (0, 0), (-1, -1), 2, status_color),
                            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                            ('TOPPADDING', (0, 0), (-1, -1), 8),
                            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                        ]))
                        
                        story.append(item_table)
                        story.append(Spacer(1, 6))
                        
                    else:
                        # Regular content with better formatting
                        story.append(Paragraph(line.strip(), self.styles['Info']))
                        story.append(Spacer(1, 4))
        else:
            # No content message
            no_content_table = Table([['📝 Nenhum conteúdo foi adicionado a este relatório.']], colWidths=[18*cm])
            no_content_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), '#f8f9fa'),
                ('BORDER', (0, 0), (-1, -1), 1, gray),
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Oblique'),
                ('FONTSIZE', (0, 0), (-1, -1), 11),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('TOPPADDING', (0, 0), (-1, -1), 20),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 20),
            ]))
            story.append(no_content_table)
        
        story.append(Spacer(1, 15))
    
    def _add_complete_photos_section(self, story, fotos):
        """Add complete photos section with professional layout"""
        story.append(Paragraph(f"📸 REGISTRO FOTOGRÁFICO ({len(fotos)} fotos)", self.styles['SectionHeader']))
        
        # Process photos in groups of 4 (2x2 grid)
        for i in range(0, len(fotos), 4):
            photo_batch = fotos[i:i+4]
            
            # Create 2x2 grid
            row1 = []
            row2 = []
            
            for idx, foto in enumerate(photo_batch):
                try:
                    # Load and resize photo
                    foto_path = os.path.join('uploads', foto.filename)
                    if os.path.exists(foto_path):
                        img = Image(foto_path, width=7*cm, height=5*cm)
                        
                        # Create photo with description
                        photo_cell = [
                            img,
                            Paragraph(f"<b>Foto #{foto.ordem}</b>", self.styles['PhotoCaption']),
                            Paragraph(foto.legenda or 'Sem descrição', self.styles['PhotoCaption']),
                        ]
                        
                        if idx < 2:
                            row1.append(photo_cell)
                        else:
                            row2.append(photo_cell)
                            
                except Exception as e:
                    print(f"Photo error: {e}")
                    # Placeholder for missing photo
                    placeholder = [
                        Paragraph("📷 Foto não encontrada", self.styles['PhotoCaption']),
                        Paragraph(f"Foto #{foto.ordem}", self.styles['PhotoCaption']),
                        Paragraph(foto.legenda or 'Sem descrição', self.styles['PhotoCaption']),
                    ]
                    if idx < 2:
                        row1.append(placeholder)
                    else:
                        row2.append(placeholder)
            
            # Fill remaining cells if needed
            while len(row1) < 2:
                row1.append('')
            while len(row2) < 2:
                row2.append('')
            
            # Create photo table
            if row1[0] or row1[1] or row2[0] or row2[1]:
                photos_table = Table([row1, row2], colWidths=[9*cm, 9*cm])
                photos_table.setStyle(TableStyle([
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('TOPPADDING', (0, 0), (-1, -1), 10),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
                    ('LEFTPADDING', (0, 0), (-1, -1), 5),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 5),
                ]))
                
                story.append(photos_table)
                story.append(Spacer(1, 15))
    
    def _add_elp_footer(self, story):
        """Add professional ELP footer"""
        footer_info = Table([[
            'ELP Consultoria e Engenharia - Serviços Especializados em Fachadas e Estruturas\n'
            'Tel: (11) 9999-9999 | E-mail: contato@elp.com.br\n'
            f'Documento gerado em {datetime.now().strftime("%d/%m/%Y às %H:%M")}'
        ]], colWidths=[18*cm])
        
        footer_info.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), '#f8f9fa'),
            ('BORDER', (0, 0), (-1, -1), 1, '#20c1e8'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 15),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 15),
            ('TEXTCOLOR', (0, 0), (-1, -1), '#343a40'),
        ]))
        
        story.append(Spacer(1, 20))
        story.append(footer_info)
    
    def _add_template_header(self, story, relatorio):
        """Add header following exact template format with ELP branding"""
        # Company header with logo
        try:
            from flask import current_app
            # Try multiple logo paths to ensure we find the correct one
            possible_logos = [
                'static/logo_elp_final.jpg',  # New ELP logo from user
                'static/logo_elp_current.jpg',
                'attached_assets/elp_1755611724757.jpg',  # User's new logo
                'static/logo_elp_new.jpg'
            ]
            logo_path = None
            for path in possible_logos:
                if os.path.exists(path):
                    logo_path = path
                    break
            if logo_path and os.path.exists(logo_path):
                logo_img = Image(logo_path, width=4*cm, height=2*cm)
                
                # Create professional ELP header
                company_info = [
                    Paragraph("<b>ELP CONSULTORIA E ENGENHARIA</b>", self.styles['CompanyHeader']),
                    Paragraph("Serviços de Engenharia Especializada em Fachadas", self.styles['CompanySubheader']),
                    Paragraph("de Obras e Empreendimentos Verticais", self.styles['CompanySubheader']),
                    Spacer(1, 8),
                    Paragraph("📞 (11) 9999-9999 | 📧 contato@elpconsultoria.com.br", self.styles['CompanyContact'])
                ]
                
                header_table = Table([
                    [logo_img, company_info]
                ], colWidths=[5*cm, 13*cm])
                
                header_table.setStyle(TableStyle([
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('ALIGN', (0, 0), (0, 0), 'CENTER'),
                    ('ALIGN', (1, 0), (1, 0), 'LEFT'),
                    ('LEFTPADDING', (0, 0), (-1, -1), 15),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 15),
                    ('TOPPADDING', (0, 0), (-1, -1), 20),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 20),
                    ('BACKGROUND', (0, 0), (-1, -1), '#f8f9fa'),
                    ('BORDER', (0, 0), (-1, -1), 3, '#20c1e8'),
                ]))
                
                story.append(header_table)
                story.append(Spacer(1, 20))
            
        except Exception as e:
            print(f"Error loading logo: {e}")
        
        # Title
        story.append(Paragraph("Relatório de Visita", self.styles['MainTitle']))
        story.append(Spacer(1, 20))
        
        # Date in right corner format
        data_formatada = relatorio.data_relatorio.strftime('%d/%m/%Y %H:%M') if relatorio.data_relatorio else now_brt().strftime('%d/%m/%Y %H:%M')
        date_table = Table([['', f'Em: {data_formatada}']], colWidths=[15*cm, 4*cm])
        date_table.setStyle(TableStyle([
            ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
            ('FONTNAME', (1, 0), (1, 0), 'Helvetica'),
            ('FONTSIZE', (1, 0), (1, 0), 10),
        ]))
        story.append(date_table)
        story.append(Spacer(1, 20))
    
    def _add_template_report_section(self, story, relatorio):
        """Add report info section following template"""
        story.append(Paragraph("Relatório", self.styles['SectionHeader']))
        story.append(Spacer(1, 10))
        
        data_formatada = relatorio.data_relatorio.strftime('%d/%m/%Y %H:%M:%S') if relatorio.data_relatorio else now_brt().strftime('%d/%m/%Y %H:%M:%S')
        
        report_table = Table([
            ['Data', ''],
            [data_formatada, '']
        ], colWidths=[8*cm, 11*cm])
        
        report_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        
        story.append(report_table)
        story.append(Spacer(1, 20))
    
    def _add_template_company_info(self, story, relatorio):
        """Add company and project info following template"""
        story.append(Paragraph("Dados gerais", self.styles['SectionHeader']))
        story.append(Spacer(1, 10))
        
        # Get project info
        projeto = relatorio.projeto if relatorio.projeto else None
        empresa = projeto.responsavel.nome_completo if projeto and projeto.responsavel else 'Não informado'
        empreendimento = projeto.nome if projeto else 'Não informado'
        
        company_table = Table([
            ['Empresa', 'Empreendimento'],
            [empresa, empreendimento]
        ], colWidths=[9.5*cm, 9.5*cm])
        
        company_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        
        story.append(company_table)
        story.append(Spacer(1, 20))
    
    def _add_template_items_section(self, story, relatorio):
        """Add items observados section following template - CHECKLIST REMOVIDO DO PDF"""
        story.append(Paragraph("Itens observados", self.styles['SectionHeader']))
        story.append(Spacer(1, 10))
        
        if relatorio.conteudo:
            # Process content but SKIP checklist items entirely
            content_lines = relatorio.conteudo.split('\n')
            in_checklist = False
            non_checklist_content = []
            
            for line in content_lines:
                line = line.strip()
                if line:
                    # Skip checklist sections entirely
                    if 'CHECKLIST DA OBRA:' in line:
                        in_checklist = True
                        continue
                    elif 'LOCALIZAÇÃO DO RELATÓRIO:' in line:
                        in_checklist = False
                        # Add location header
                        location_table = Table([['📍 LOCALIZAÇÃO DO RELATÓRIO']], colWidths=[18*cm])
                        location_table.setStyle(TableStyle([
                            ('BACKGROUND', (0, 0), (-1, -1), '#f0fff0'),
                            ('BORDER', (0, 0), (-1, -1), 1, '#228b22'),
                            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
                            ('FONTSIZE', (0, 0), (-1, -1), 12),
                            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                            ('TOPPADDING', (0, 0), (-1, -1), 8),
                            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                        ]))
                        story.append(location_table)
                        story.append(Spacer(1, 8))
                        continue
                    elif in_checklist and (line.startswith('✓') or line.startswith('○')):
                        # Skip checklist items completely
                        continue
                    elif in_checklist and line.strip().startswith('Observações:'):
                        # Skip checklist observations
                        continue
                    elif not in_checklist:
                        # Only process non-checklist content
                        if line.startswith('Latitude:') or line.startswith('Longitude:') or '(Coordenadas:' in line:
                            story.append(Paragraph(f"<i>{line.strip()}</i>", self.styles['Info']))
                        elif any(keyword in line for keyword in ['Rua', 'Avenida', 'Estrada', 'Brasil', 'São Paulo', 'Rodovia']):
                            story.append(Paragraph(f"<b>{line.strip()}</b>", self.styles['Info']))
                        else:
                            story.append(Paragraph(line.strip(), self.styles['Info']))
                else:
                    if not in_checklist:
                        story.append(Spacer(1, 6))
            
            story.append(Spacer(1, 20))
        else:
            # Show simple message when no content
            story.append(Paragraph("Vide fotos.", self.styles['Info']))
            story.append(Spacer(1, 20))
    
    def _add_project_info(self, story, relatorio):
        """Add project information section"""
        story.append(Paragraph("INFORMAÇÕES DA OBRA", self.styles['Header']))
        
        projeto = relatorio.projeto
        project_data = [
            ['Número do Projeto:', projeto.numero],
            ['Nome:', projeto.nome],
            ['Tipo de Obra:', projeto.tipo_obra.nome if projeto.tipo_obra else 'N/A'],
            ['Endereço:', projeto.endereco or 'N/A'],
            ['Responsável:', projeto.responsavel.nome_completo if projeto.responsavel else 'N/A'],
            ['Status:', projeto.status],
        ]
        
        if projeto.data_inicio:
            project_data.append(['Data de Início:', projeto.data_inicio.strftime('%d/%m/%Y')])
        if projeto.data_previsao_fim:
            project_data.append(['Previsão de Término:', projeto.data_previsao_fim.strftime('%d/%m/%Y')])
        
        project_table = Table(project_data, colWidths=[4*cm, 12*cm])
        project_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        
        story.append(project_table)
        story.append(Spacer(1, 20))
    
    def _add_visit_info(self, story, visita):
        """Add visit information section with enhanced GPS formatting"""
        story.append(Paragraph("INFORMAÇÕES DA VISITA", self.styles['Header']))
        
        visit_data = [
            ['Data Agendada:', visita.data_agendada.strftime('%d/%m/%Y às %H:%M')],
            ['Status:', visita.status],
        ]
        
        if visita.data_realizada:
            visit_data.append(['Data Realizada:', visita.data_realizada.strftime('%d/%m/%Y às %H:%M')])
        
        if visita.objetivo:
            visit_data.append(['Objetivo:', visita.objetivo])
        
        if visita.atividades_realizadas:
            visit_data.append(['Atividades Realizadas:', visita.atividades_realizadas])
        
        if visita.observacoes:
            visit_data.append(['Observações:', visita.observacoes])
        
        # Enhanced GPS location formatting
        # Enhanced GPS location formatting
        if visita.endereco_gps:
            visit_data.append(['📍 Localização GPS:', visita.endereco_gps])
        
        if hasattr(visita, 'latitude') and hasattr(visita, 'longitude') and visita.latitude and visita.longitude:
            coords_text = f"Coordenadas: {visita.latitude:.6f}, {visita.longitude:.6f}"
            visit_data.append(['🗺️ Coordenadas Exatas:', coords_text])
        
        visit_table = Table(visit_data, colWidths=[4*cm, 12*cm])
        visit_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        
        story.append(visit_table)
        story.append(Spacer(1, 20))
    
    def _add_report_content(self, story, relatorio):
        """Add report content section"""
        if relatorio.conteudo:
            story.append(Paragraph("CONTEÚDO DO RELATÓRIO", self.styles['Header']))
            
            # Process content to handle line breaks
            content_lines = relatorio.conteudo.split('\n')
            for line in content_lines:
                if line.strip():
                    story.append(Paragraph(line, self.styles['Normal']))
                else:
                    story.append(Spacer(1, 6))
            
            story.append(Spacer(1, 20))
    
    def _add_template_photos_grid(self, story, fotos):
        """Add photos in 2x2 grid format following template with ELP branding"""
        fotos_ordenadas = sorted(fotos, key=lambda x: x.ordem if hasattr(x, 'ordem') else 0)
        
        # PROFESSIONAL ELP PHOTO SECTION HEADER
        photos_header = Table([['📸 REGISTRO FOTOGRÁFICO - ELP CONSULTORIA E ENGENHARIA']], colWidths=[18*cm])
        photos_header.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), '#20c1e8'),  # ELP cyan
            ('BORDER', (0, 0), (-1, -1), 3, '#343a40'),  # ELP dark border
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 16),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 15),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 15),
            ('TEXTCOLOR', (0, 0), (-1, -1), white),
        ]))
        story.append(photos_header)
        story.append(Spacer(1, 20))
        
        # Process photos in professional 2x2 grid layout
        for i in range(0, len(fotos_ordenadas), 4):
            batch = fotos_ordenadas[i:i+4]
            
            # Create professional 2x2 grid with ELP styling
            row1_data = []
            row2_data = []
            
            # First row (first 2 photos)
            for j in range(2):
                if j < len(batch):
                    foto = batch[j]
                    photo_cell = self._create_photo_cell(foto)
                    row1_data.append(photo_cell)
                else:
                    # Create empty placeholder with ELP styling
                    empty_cell = Table([['📷 Posição Reservada']], colWidths=[9*cm])
                    empty_cell.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, -1), '#f8f9fa'),
                        ('BORDER', (0, 0), (-1, -1), 1, '#dee2e6'),
                        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                        ('FONTSIZE', (0, 0), (-1, -1), 10),
                        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                        ('TOPPADDING', (0, 0), (-1, -1), 30),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 30),
                        ('TEXTCOLOR', (0, 0), (-1, -1), '#6c757d'),
                    ]))
                    row1_data.append(empty_cell)
            
            # Second row (next 2 photos)
            for j in range(2, 4):
                if j < len(batch):
                    foto = batch[j]
                    photo_cell = self._create_photo_cell(foto)
                    row2_data.append(photo_cell)
                else:
                    # Create empty placeholder with ELP styling
                    empty_cell = Table([['📷 Posição Reservada']], colWidths=[9*cm])
                    empty_cell.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, -1), '#f8f9fa'),
                        ('BORDER', (0, 0), (-1, -1), 1, '#dee2e6'),
                        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                        ('FONTSIZE', (0, 0), (-1, -1), 10),
                        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                        ('TOPPADDING', (0, 0), (-1, -1), 30),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 30),
                        ('TEXTCOLOR', (0, 0), (-1, -1), '#6c757d'),
                    ]))
                    row2_data.append(empty_cell)
            
            # Create professional table with ELP grid styling
            photo_table = Table([row1_data, row2_data], colWidths=[9*cm, 9*cm], rowHeights=[8*cm, 8*cm])
            photo_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('GRID', (0, 0), (-1, -1), 2, '#20c1e8'),  # ELP cyan grid
                ('BOTTOMPADDING', (0, 0), (-1, -1), 15),
                ('TOPPADDING', (0, 0), (-1, -1), 15),
                ('LEFTPADDING', (0, 0), (-1, -1), 10),
                ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ]))
            
            story.append(photo_table)
            story.append(Spacer(1, 25))
            
            # Add page break if not last batch and there are more photos
            if i + 4 < len(fotos_ordenadas):
                story.append(PageBreak())
    
    def _create_photo_cell(self, foto, single=False):
        """Create a photo cell with image and caption with ELP branding"""
        try:
            # Use annotated photo if available, otherwise use original
            photo_path = foto.filename_anotada if hasattr(foto, 'filename_anotada') and foto.filename_anotada else foto.filename
            full_path = os.path.join(current_app.config['UPLOAD_FOLDER'], photo_path)
            
            if os.path.exists(full_path):
                # Create image with appropriate size
                max_width = 12*cm if single else 8*cm
                max_height = 8*cm if single else 5*cm
                
                img = Image(full_path)
                img_width, img_height = self._calculate_image_size(full_path, max_width=max_width, max_height=max_height)
                img.drawWidth = img_width
                img.drawHeight = img_height
                
                # Create enhanced caption with ELP styling
                caption_text = foto.legenda if hasattr(foto, 'legenda') and foto.legenda else 'Foto da obra'
                
                # Create a styled caption table
                caption_table = Table([[caption_text]], colWidths=[max_width])
                caption_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, -1), '#f8f9fa'),
                    ('BORDER', (0, 0), (-1, -1), 0.5, '#343a40'),
                    ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                    ('FONTSIZE', (0, 0), (-1, -1), 9),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('TOPPADDING', (0, 0), (-1, -1), 4),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                    ('TEXTCOLOR', (0, 0), (-1, -1), '#343a40'),
                ]))
                
                # Return as list for table cell
                return [img, Spacer(1, 3), caption_table]
            else:
                # Create error cell with ELP styling
                error_table = Table([['📷 Foto não encontrada']], colWidths=[8*cm])
                error_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, -1), '#fff3cd'),
                    ('BORDER', (0, 0), (-1, -1), 1, '#856404'),
                    ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                    ('FONTSIZE', (0, 0), (-1, -1), 10),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('TOPPADDING', (0, 0), (-1, -1), 20),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 20),
                ]))
                return error_table
        except Exception as e:
            current_app.logger.error(f"Error creating photo cell for {foto.filename}: {e}")
            # Create error cell with ELP styling
            error_table = Table([['❌ Erro ao carregar foto']], colWidths=[8*cm])
            error_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), '#f8d7da'),
                ('BORDER', (0, 0), (-1, -1), 1, '#721c24'),
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 20),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 20),
            ]))
            return error_table
    
    def _calculate_image_size(self, image_path, max_width=15*cm, max_height=20*cm):
        """Calculate image size maintaining aspect ratio"""
        try:
            with PILImage.open(image_path) as img:
                width, height = img.size
                
            # Calculate scale to fit within max dimensions
            scale_width = max_width / width
            scale_height = max_height / height
            scale = min(scale_width, scale_height)
            
            return width * scale, height * scale
        except:
            return max_width, max_width * 0.75  # Default aspect ratio
    
    def _add_template_signatures(self, story, relatorio):
        """Add signatures section following template with ELP branding"""
        story.append(Spacer(1, 30))
        
        story.append(Paragraph("Assinaturas", self.styles['SectionHeader']))
        story.append(Spacer(1, 20))
        
        # Get signature info
        preenchido_por = relatorio.autor.nome_completo if relatorio.autor else 'Não informado'
        liberado_por = 'Engenheiro Civil\nELP Consultoria e Engenharia'
        responsavel = 'ELP Consultoria e Engenharia\nEspecialista em Fachadas'
        
        signatures_table = Table([
            ['Preenchido por:', 'Liberado por:', 'Responsável pelo acompanhamento'],
            [preenchido_por, liberado_por, responsavel]
        ], colWidths=[6.3*cm, 6.3*cm, 6.3*cm])
        
        signatures_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 30),
            ('GRID', (0, 0), (-1, -1), 0.5, black),
            ('TEXTCOLOR', (0, 1), (-1, 1), '#343a40'),
        ]))
        
        story.append(signatures_table)
    
    def _add_template_footer(self, canvas, doc):
        """Add footer following exact template format with ELP branding"""
        # Company info on left
        canvas.setFont('Helvetica-Bold', 9)
        canvas.drawString(40, 60, 'ELP CONSULTORIA E ENGENHARIA')
        
        canvas.setFont('Helvetica', 8)
        canvas.drawString(40, 45, 'Serviços de Engenharia - Especializada em Fachadas')
        canvas.drawString(40, 32, 'Consultoria voltada para Engenharia Civil')
        canvas.drawString(40, 19, 'Sistema de Relatórios de Obras e Empreendimentos Verticais')
        
        # Generated info on right
        canvas.setFont('Helvetica', 8)
        canvas.drawRightString(555, 32, 'ELP Consultoria e Engenharia')
        canvas.drawRightString(555, 19, f'Relatório gerado em {datetime.now().strftime("%d/%m/%Y %H:%M")}')

def generate_visit_report_pdf(relatorio):
    """Generate PDF report for a visit"""
    generator = ReportPDFGenerator()
    
    # Create filename
    safe_filename = f"relatorio_{relatorio.numero}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    output_path = os.path.join(current_app.config['UPLOAD_FOLDER'], safe_filename)
    
    # Generate PDF
    pdf_path = generator.generate_visit_report_pdf(relatorio, output_path)
    
    return pdf_path, safe_filename

    def generate_reimbursement_pdf(self, reembolso, output_path):
        """Generate PDF for approved reimbursement"""
        try:
            doc = SimpleDocTemplate(output_path, pagesize=letter)
            story = []
            
            # Header
            styles = getSampleStyleSheet()
            title_style = ParagraphStyle(
                'CustomTitle',
                parent=styles['Heading1'],
                fontSize=18,
                spaceAfter=20,
                alignment=1,  # Center
                textColor=colors.HexColor('#1f5582')
            )
            
            story.append(Paragraph("COMPROVANTE DE REEMBOLSO APROVADO", title_style))
            story.append(Spacer(1, 20))
            
            # Reembolso info
            info_data = [
                ['ID do Reembolso:', f'#{reembolso.id}'],
                ['Solicitante:', reembolso.usuario.nome_completo if reembolso.usuario else '-'],
                ['Projeto:', reembolso.projeto.nome if reembolso.projeto else '-'],
                ['Período:', reembolso.periodo or '-'],
                ['Data da Solicitação:', reembolso.created_at.strftime('%d/%m/%Y %H:%M') if reembolso.created_at else '-'],
                ['Data da Aprovação:', reembolso.data_aprovacao.strftime('%d/%m/%Y %H:%M') if reembolso.data_aprovacao else '-'],
                ['Status:', reembolso.status]
            ]
            
            info_table = Table(info_data, colWidths=[2*inch, 4*inch])
            info_table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('LEFTPADDING', (0, 0), (-1, -1), 5),
                ('RIGHTPADDING', (0, 0), (-1, -1), 5),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ]))
            
            story.append(info_table)
            story.append(Spacer(1, 20))
            
            # Motivo
            if reembolso.motivo:
                story.append(Paragraph("<b>Motivo da Solicitação:</b>", styles['Normal']))
                story.append(Paragraph(reembolso.motivo, styles['Normal']))
                story.append(Spacer(1, 15))
            
            # Detalhamento dos gastos
            story.append(Paragraph("<b>DETALHAMENTO DOS GASTOS</b>", styles['Heading2']))
            story.append(Spacer(1, 10))
            
            # Calculate combustible total
            total_combustivel = (reembolso.quilometragem or 0) * (reembolso.valor_km or 0)
            
            gastos_data = [
                ['Descrição', 'Quantidade', 'Valor Unitário', 'Total'],
                ['Combustível (km percorrida)', f'{reembolso.quilometragem or 0:.1f} km', 
                 f'R$ {reembolso.valor_km or 0:.2f}', f'R$ {total_combustivel:.2f}'],
                ['Alimentação', '-', '-', f'R$ {reembolso.alimentacao or 0:.2f}'],
                ['Hospedagem', '-', '-', f'R$ {reembolso.hospedagem or 0:.2f}'],
                ['Outros gastos', '-', '-', f'R$ {reembolso.outros_gastos or 0:.2f}'],
                ['', '', 'TOTAL GERAL:', f'R$ {reembolso.total:.2f}']
            ]
            
            gastos_table = Table(gastos_data, colWidths=[2.5*inch, 1*inch, 1.2*inch, 1.3*inch])
            gastos_table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('ALIGN', (0, 1), (0, -1), 'LEFT'),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 1), (-1, -1), 9),
                ('LEFTPADDING', (0, 0), (-1, -1), 5),
                ('RIGHTPADDING', (0, 0), (-1, -1), 5),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ('FONTNAME', (2, -1), (-1, -1), 'Helvetica-Bold'),
                ('BACKGROUND', (2, -1), (-1, -1), colors.lightgrey),
            ]))
            
            story.append(gastos_table)
            story.append(Spacer(1, 20))
            
            # Build PDF
            doc.build(story)
            return output_path
            
        except Exception as e:
            print(f"Error generating reimbursement PDF: {e}")
            raise