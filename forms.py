import datetime
from flask_wtf import FlaskForm
from flask_wtf.file import FileField, FileAllowed, FileRequired
from wtforms import StringField, PasswordField, SubmitField, BooleanField, TextAreaField, SelectField, DateField, FileField, HiddenField, IntegerField, DateTimeField, FloatField, SelectMultipleField
from wtforms.validators import DataRequired, Email, EqualTo, Length, Optional, ValidationError, NumberRange
from wtforms.widgets import TextArea
from models import User, TipoObra, Contato

class LoginForm(FlaskForm):
    username = StringField('Usuário', validators=[DataRequired()])
    password = PasswordField('Senha', validators=[DataRequired()])
    remember_me = BooleanField('Lembrar-me')

class ForgotPasswordForm(FlaskForm):
    email = StringField('Email', validators=[DataRequired(), Email()])
    submit = SubmitField('Enviar Link de Recuperação')

class ResetPasswordForm(FlaskForm):
    password = PasswordField('Nova Senha', validators=[DataRequired(), Length(min=6)])
    password2 = PasswordField('Confirmar Nova Senha', validators=[DataRequired(), EqualTo('password', message='As senhas devem coincidir')])
    submit = SubmitField('Redefinir Senha')

# Formulário para troca de senha no primeiro login
class FirstLoginForm(FlaskForm):
    current_password = PasswordField('Senha Atual', validators=[DataRequired()])
    new_password = PasswordField('Nova Senha', validators=[DataRequired(), Length(min=6)])
    confirm_password = PasswordField('Confirmar Nova Senha', validators=[DataRequired(), EqualTo('new_password', message='As senhas devem coincidir')])

class RegisterForm(FlaskForm):
    username = StringField('Usuário', validators=[DataRequired(), Length(min=4, max=25)])
    email = StringField('Email', validators=[DataRequired(), Email()])
    nome_completo = StringField('Nome Completo', validators=[DataRequired(), Length(max=200)])
    cargo = StringField('Cargo', validators=[Length(max=100)])
    telefone = StringField('Telefone', validators=[Length(max=20)])
    password = PasswordField('Senha', validators=[DataRequired(), Length(min=6)])
    password2 = PasswordField('Confirmar Senha', validators=[DataRequired(), EqualTo('password')])
    is_master = BooleanField('Usuário Master')

class UserForm(FlaskForm):
    username = StringField('Usuário', validators=[DataRequired(), Length(min=4, max=25)])
    email = StringField('Email', validators=[DataRequired(), Email()])
    nome_completo = StringField('Nome Completo', validators=[DataRequired(), Length(max=200)])
    cargo = StringField('Cargo', validators=[Length(max=100)])
    telefone = StringField('Telefone', validators=[Length(max=20)])
    is_master = BooleanField('Usuário Master')
    ativo = BooleanField('Ativo', default=True)
    password = PasswordField('Nova Senha (deixe em branco para manter atual)', validators=[Optional(), Length(min=6)])
    password2 = PasswordField('Confirmar Nova Senha', validators=[EqualTo('password')])

class ProjetoForm(FlaskForm):
    nome = StringField('Nome da Obra', validators=[DataRequired(), Length(max=200)])
    endereco = TextAreaField('Endereço')
    latitude = HiddenField()
    longitude = HiddenField()
    construtora = StringField('Construtora', validators=[DataRequired(), Length(max=200)])
    responsavel_id = SelectField('Responsável', coerce=int, validators=[DataRequired()])
    numeracao_inicial = IntegerField('Numeração Inicial dos Relatórios', validators=[Optional(), NumberRange(min=1)], default=1)
    status = SelectField('Status', choices=[
        ('Não iniciado', 'Não iniciado'),
        ('Ativo', 'Ativo'),
        ('Pausado', 'Pausado'),
        ('Concluído', 'Concluído')
    ], default='Não iniciado')
    
    # Informações Técnicas (todos opcionais)
    elementos_construtivos_base = TextAreaField('Elementos construtivos da base', validators=[Optional()])
    especificacao_chapisco_colante = TextAreaField('Especificação chapisco colante', validators=[Optional()])
    especificacao_chapisco_alvenaria = TextAreaField('Especificação chapisco da alvenaria', validators=[Optional()])
    especificacao_argamassa_emboco = TextAreaField('Especificação da argamassa de emboço', validators=[Optional()])
    forma_aplicacao_argamassa = TextAreaField('Forma da aplicação da argamassa de emboço', validators=[Optional()])
    acabamentos_revestimento = TextAreaField('Acabamentos do revestimento', validators=[Optional()])
    acabamento_peitoris = TextAreaField('Acabamento em peitoris de janela', validators=[Optional()])
    acabamento_muretas = TextAreaField('Acabamento em muretas de terraços', validators=[Optional()])
    definicao_frisos_cor = TextAreaField('Definição sobre frisos de mudança de cor de textura', validators=[Optional()])
    definicao_face_inferior_abas = TextAreaField('Definição sobre face inferior das abas (friso pingadeira ou caimento invertido)', validators=[Optional()])
    observacoes_projeto_fachada = TextAreaField('Caso haja projeto de fachada, especificar o projetista e fazer observações sobre procedimentos específicos ou divergências de orientações', validators=[Optional()])
    outras_observacoes = TextAreaField('Outras observações', validators=[Optional()])

    def __init__(self, *args, **kwargs):
        super(ProjetoForm, self).__init__(*args, **kwargs)
        self.responsavel_id.choices = [(u.id, u.nome_completo) for u in User.query.filter_by(ativo=True).all()]

class ContatoForm(FlaskForm):
    nome = StringField('Nome', validators=[DataRequired(), Length(max=200)])
    email = StringField('Email', validators=[Optional(), Email()])
    telefone = StringField('Telefone', validators=[Length(max=20)])
    empresa = StringField('Empresa', validators=[Length(max=200)])
    cargo = StringField('Cargo', validators=[Length(max=100)])
    observacoes = TextAreaField('Observações')

class ContatoProjetoForm(FlaskForm):
    contato_id = SelectField('Contato', coerce=int, validators=[DataRequired()])
    tipo_relacionamento = StringField('Tipo de Relacionamento', validators=[Length(max=100)])
    is_aprovador = BooleanField('É Aprovador')
    receber_relatorios = BooleanField('Receber Relatórios por Email')

    def __init__(self, *args, **kwargs):
        super(ContatoProjetoForm, self).__init__(*args, **kwargs)
        # Filtrar apenas contatos ativos
        from models import Contato
        contatos_ativos = Contato.query.filter_by(ativo=True).all() if hasattr(Contato, 'ativo') else Contato.query.all()
        self.contato_id.choices = [(c.id, f"{c.nome} - {c.empresa or 'Sem empresa'}") for c in contatos_ativos]

class EmailClienteForm(FlaskForm):
    email = StringField('E-mail (opcional)', validators=[Optional(), Email(), Length(max=255)])
    nome_contato = StringField('Nome do Contato', validators=[DataRequired(), Length(max=200)])
    cargo = StringField('Cargo', validators=[Length(max=100)])
    empresa = StringField('Empresa', validators=[Length(max=200)])
    telefone = StringField('Telefone', validators=[Length(max=20)])
    receber_notificacoes = BooleanField('Receber Notificações', default=True)
    receber_relatorios = BooleanField('Receber Relatórios', default=True)
    ativo = BooleanField('Ativo', default=True)

class VisitaForm(FlaskForm):
    projeto_id = SelectField('Obra', coerce=int, validators=[Optional()])
    projeto_outros = StringField('Nome da Obra (Outros)', validators=[Optional(), Length(max=300)])
    responsavel_id = SelectField('Responsável', coerce=int, validators=[DataRequired()])
    data_inicio = StringField('Data e Hora de Início', validators=[DataRequired()])
    data_fim = StringField('Data e Hora de Fim', validators=[DataRequired()])
    observacoes = TextAreaField('Observações', validators=[Optional()])
    participantes = SelectMultipleField('Participantes', coerce=int, validators=[Optional()])
    is_pessoal = BooleanField('Compromisso Pessoal', default=False)  # Item 31

    def __init__(self, *args, **kwargs):
        # Extract visit parameter if provided for editing
        visit = kwargs.pop('visit', None)
        current_user_id = kwargs.pop('current_user_id', None)
        
        super(VisitaForm, self).__init__(*args, **kwargs)
        from models import Projeto, User

        # Adicionar opção 'Outros' aos projetos
        projetos_ativos = Projeto.query.filter_by(status='Ativo').all()
        projetos_ativos_ids = [p.id for p in projetos_ativos]
        
        choices_projetos = [(-1, 'Outros')] + [(p.id, f"{p.numero} - {p.nome}") for p in projetos_ativos]
        
        # Se estiver editando uma visita e o projeto dela não estiver ativo, adiciona-o à lista
        if visit and visit.projeto_id and visit.projeto_id not in projetos_ativos_ids:
            projeto_atual = Projeto.query.get(visit.projeto_id)
            if projeto_atual:
                choices_projetos.append((projeto_atual.id, f"{projeto_atual.numero} - {projeto_atual.nome} [{projeto_atual.status}]"))
                
        self.projeto_id.choices = choices_projetos

        # Carregar usuários ativos para seleção de responsável
        usuarios_ativos = User.query.filter_by(ativo=True).all()
        responsavel_choices = [(u.id, f"{u.nome_completo} ({u.cargo})") for u in usuarios_ativos]
        
        # Se editando e o responsável atual está inativo, incluir na lista
        if visit and visit.responsavel_id:
            responsavel_atual = User.query.get(visit.responsavel_id)
            if responsavel_atual and not responsavel_atual.ativo:
                responsavel_choices.insert(0, (responsavel_atual.id, f"{responsavel_atual.nome_completo} ({responsavel_atual.cargo}) [Inativo]"))
        
        self.responsavel_id.choices = responsavel_choices
        
        # Definir valor padrão para responsavel_id se não estiver definido
        if not self.responsavel_id.data and current_user_id:
            self.responsavel_id.data = current_user_id
        
        # Carregar usuários ativos para seleção de participantes
        self.participantes.choices = [(u.id, f"{u.nome_completo} ({u.cargo})") for u in usuarios_ativos]

    def validate(self, extra_validators=None):
        """Validação customizada"""
        result = super().validate(extra_validators)

        # Se 'Outros' foi selecionado, o campo projeto_outros deve ser preenchido
        if self.projeto_id.data == -1 and not self.projeto_outros.data:
            self.projeto_outros.errors.append('Campo obrigatório quando "Outros" é selecionado.')
            result = False

        # Se um projeto específico foi selecionado, limpar projeto_outros
        if self.projeto_id.data and self.projeto_id.data != -1:
            self.projeto_outros.data = None

        # Validar se data_fim é posterior a data_inicio
        if self.data_inicio.data and self.data_fim.data:
            try:
                from datetime import datetime
                # Parse datetime-local format (YYYY-MM-DDTHH:MM)
                dt_inicio = datetime.fromisoformat(self.data_inicio.data)
                dt_fim = datetime.fromisoformat(self.data_fim.data)
                
                if dt_fim <= dt_inicio:
                    self.data_fim.errors.append('A data de fim deve ser posterior à data de início.')
                    result = False
            except (ValueError, TypeError):
                self.data_inicio.errors.append('Formato de data inválido.')
                result = False

        return result

# ReportForm removed - use RelatorioForm instead which doesn't have titulo field

class ChecklistPadraoForm(FlaskForm):
    titulo = StringField('Título do Item', validators=[DataRequired(), Length(max=200)])
    descricao = TextAreaField('Descrição', validators=[Optional()])
    categoria = SelectField('Categoria', choices=[
        ('Estrutural', 'Estrutural'),
        ('Acabamentos', 'Acabamentos'),
        ('Instalações', 'Instalações'),
        ('Segurança', 'Segurança'),
        ('Limpeza', 'Limpeza'),
        ('Geral', 'Geral')
    ], default='Geral', validators=[DataRequired()])
    ordem = IntegerField('Ordem', validators=[Optional(), NumberRange(min=1)])
    obrigatorio = BooleanField('Item Obrigatório', default=False)
    ativo = BooleanField('Ativo', default=True)

class RelatorioForm(FlaskForm):
    projeto_id = SelectField('Projeto', coerce=int, validators=[DataRequired()])
    titulo = StringField('Título do Relatório', validators=[DataRequired(), Length(max=300)], default='Relatório de visita')
    data_relatorio = DateField('Data do Relatório', validators=[DataRequired()], default=datetime.date.today)
    aprovador_nome = StringField('Nome do Aprovador', validators=[DataRequired(), Length(max=200)])
    conteudo = TextAreaField('Conteúdo do Relatório', validators=[Optional()], widget=TextArea())
    observacoes = TextAreaField('Observações Gerais', validators=[Optional()])
    lembrete_proxima_visita = TextAreaField('Lembrete para Próxima Visita', validators=[Optional()])
    status = SelectField('Status', choices=[
        ('Rascunho', 'Rascunho'),
        ('Aguardando Aprovacao', 'Aguardando Aprovação'),
        ('Aprovado', 'Aprovado'),
        ('Rejeitado', 'Rejeitado')
    ], default='Rascunho')

    def __init__(self, *args, **kwargs):
        super(RelatorioForm, self).__init__(*args, **kwargs)
        from models import Projeto
        self.projeto_id.choices = [(0, 'Selecione um projeto')] + [(p.id, f"{p.numero} - {p.nome}") for p in Projeto.query.filter_by(status='Ativo').all()]

class ReembolsoForm(FlaskForm):
    titulo = StringField('Título do Reembolso', validators=[DataRequired(), Length(max=200)])
    projeto_id = SelectField('Projeto', coerce=int, validators=[DataRequired()])
    data_solicitacao = DateField('Data da Solicitação', validators=[DataRequired()], default=datetime.date.today)
    descricao = TextAreaField('Descrição/Justificativa', validators=[DataRequired()])

    # Categoria gastos com tratamento robusto
    quilometragem = FloatField('Quilometragem', validators=[Optional(), NumberRange(min=0)], default=0)
    valor_km = FloatField('Valor por KM (R$)', validators=[Optional(), NumberRange(min=0)], default=0)
    alimentacao = FloatField('Alimentação (R$)', validators=[Optional(), NumberRange(min=0)], default=0)
    hospedagem = FloatField('Hospedagem (R$)', validators=[Optional(), NumberRange(min=0)], default=0)
    outros_gastos = FloatField('Outros Gastos (R$)', validators=[Optional(), NumberRange(min=0)], default=0)

    status = SelectField('Status', choices=[
        ('Pendente', 'Pendente'),
        ('Aprovado', 'Aprovado'),
        ('Rejeitado', 'Rejeitado'),
        ('Pago', 'Pago')
    ], default='Pendente')

    def __init__(self, *args, **kwargs):
        super(ReembolsoForm, self).__init__(*args, **kwargs)
        from models import Projeto
        self.projeto_id.choices = [(0, 'Selecione um projeto')] + [(p.id, f"{p.numero} - {p.nome}") for p in Projeto.query.filter_by(status='Ativo').all()]

    def validate(self, extra_validators=None):
        """Validação personalizada para garantir que pelo menos um valor seja preenchido"""
        if not super().validate(extra_validators):
            return False

        # Verificar se pelo menos um campo de valor foi preenchido
        valores = [
            self.quilometragem.data or 0,
            self.alimentacao.data or 0,
            self.hospedagem.data or 0,
            self.outros_gastos.data or 0
        ]

        if all(v == 0 for v in valores):
            self.quilometragem.errors.append('Pelo menos um valor de gasto deve ser informado.')
            return False

        return True

class ConfiguracaoEmailForm(FlaskForm):
    smtp_server = StringField('Servidor SMTP', validators=[DataRequired(), Length(max=255)])
    smtp_port = IntegerField('Porta SMTP', validators=[DataRequired(), NumberRange(min=1, max=65535)])
    smtp_username = StringField('Usuário SMTP', validators=[DataRequired(), Email(), Length(max=255)])
    smtp_password = PasswordField('Senha SMTP', validators=[Optional(), Length(max=255)])
    use_tls = BooleanField('Usar TLS', default=True)
    remetente_nome = StringField('Nome do Remetente', validators=[DataRequired(), Length(max=200)])
    remetente_email = StringField('E-mail do Remetente', validators=[DataRequired(), Email(), Length(max=255)])

# Formulários adicionais que estavam faltando
class VisitaRealizadaForm(FlaskForm):
    atividades_realizadas = TextAreaField('Atividades Realizadas', validators=[Optional()])
    observacoes = TextAreaField('Observações da Visita', validators=[Optional()])
    latitude = HiddenField('Latitude', validators=[Optional()])
    longitude = HiddenField('Longitude', validators=[Optional()])
    endereco_gps = HiddenField('Endereço GPS', validators=[Optional()])
    submit = SubmitField('Registrar Visita')

class FotoRelatorioForm(FlaskForm):
    legenda = StringField('Legenda da Foto', validators=[Optional(), Length(max=500)])
    categoria = SelectField('Categoria', choices=[('', 'Sem categoria')], validators=[Optional()])
    local = StringField('Local', validators=[Optional(), Length(max=300)], render_kw={'placeholder': 'Local ou ambiente da foto'})
    
    def set_categoria_choices(self, projeto_id):
        """Define as escolhas de categoria baseado no projeto"""
        from models import CategoriaObra
        
        categorias = CategoriaObra.query.filter_by(projeto_id=projeto_id).order_by(CategoriaObra.ordem).all()
        
        if categorias:
            self.categoria.choices = [('', 'Sem categoria')] + [
                (c.nome_categoria, c.nome_categoria) for c in categorias
            ]
        else:
            self.categoria.choices = [('', 'Sem categoria')]

class LegendaPredefinidaForm(FlaskForm):
    texto = StringField('Texto da Legenda', validators=[DataRequired(), Length(max=500)])
    categoria = SelectField('Categoria', choices=[
        ('Geral', 'Geral'),
        ('Estrutural', 'Estrutural'),
        ('Hidráulica', 'Hidráulica'),
        ('Elétrica', 'Elétrica'),
        ('Acabamentos', 'Acabamentos'),
        ('Segurança', 'Segurança'),
        ('Fachada', 'Fachada'),
        ('Impermeabilização', 'Impermeabilização')
    ], default='Geral', validators=[DataRequired()])
    ativo = BooleanField('Ativo', default=True)
    submit = SubmitField('Salvar')