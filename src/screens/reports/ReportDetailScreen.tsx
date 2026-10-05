import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  Image, Alert, ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { 
  getLocalRelatorioById, getLocalFotos, updateLocalRelatorioStatus, addToSyncQueue 
} from '../../database/db';
import { generateReportPDF, shareReportPDF } from '../../services/pdfService';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { Relatorio, FotoRelatorio } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

export const ReportDetailScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const { reportId } = route.params;
  const { user } = useAuth();
  const { isOnline, triggerSync } = useNetwork();

  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const [fotos, setFotos] = useState<FotoRelatorio[]>([]);
  const [loadingPdf, setLoadingPdf] = useState(false);

  useEffect(() => {
    loadReport();
  }, [reportId]);

  async function loadReport() {
    try {
      const r = await getLocalRelatorioById(reportId);
      setRelatorio(r);
      const f = await getLocalFotos(reportId);
      setFotos(f);
    } catch (e) {
      console.warn('Erro ao carregar relatório:', e);
    }
  }

  async function handleExportPDF() {
    if (!relatorio) return;
    setLoadingPdf(true);
    try {
      const pdfUri = await generateReportPDF(relatorio, fotos);
      await shareReportPDF(pdfUri);
    } catch (err: any) {
      Alert.alert('Erro ao Gerar PDF', err.message || 'Falha ao processar PDF.');
    } finally {
      setLoadingPdf(false);
    }
  }

  async function handleSubmitApproval() {
    if (!relatorio) return;
    try {
      await updateLocalRelatorioStatus(
        relatorio.id,
        'Aguardando Aprovação',
        '',
        undefined,
        undefined,
        'pending'
      );
      await addToSyncQueue(
        'relatorio',
        relatorio.id,
        'submit_approval',
        `/api/reports/${relatorio.id}/submit`,
        'POST',
        { status: 'Aguardando Aprovação' }
      );
      if (isOnline) triggerSync();
      await loadReport();
      Alert.alert('Sucesso', 'Relatório submetido para aprovação!');
    } catch (err: any) {
      Alert.alert('Erro', err.message);
    }
  }

  if (!relatorio) {
    return (
      <View style={styles.container}>
        <Header title="Detalhes do Relatório" showBack onBack={() => navigation.goBack()} />
        <View style={styles.center}><Text>Carregando...</Text></View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header 
        title={relatorio.numero} 
        subtitle={relatorio.projeto_nome || 'Relatório'}
        showBack 
        onBack={() => navigation.goBack()} 
      />
      <OfflineBanner />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Main Card */}
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.reportTitle}>{relatorio.titulo}</Text>
              <Text style={styles.reportSubtitle}>{relatorio.projeto_nome}</Text>
            </View>
            <SyncStatusBadge status={relatorio.sync_status} />
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Autor da Vistoria:</Text>
            <Text style={styles.value}>{relatorio.autor_nome || 'Engenheiro Responsável'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Data do Relatório:</Text>
            <Text style={styles.value}>
              {relatorio.data_relatorio ? new Date(relatorio.data_relatorio).toLocaleDateString('pt-BR') : ''}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Local Específico:</Text>
            <Text style={styles.value}>{relatorio.local || 'Geral na Obra'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Categoria:</Text>
            <Text style={styles.value}>{relatorio.categoria || 'Geral'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Status do Fluxo:</Text>
            <View style={[
              styles.statusPill, 
              relatorio.status === 'Aprovado' ? styles.statusApproved : 
              relatorio.status === 'Aguardando Aprovação' ? styles.statusWaiting : styles.statusProgress
            ]}>
              <Text style={styles.statusPillText}>{relatorio.status}</Text>
            </View>
          </View>

          {relatorio.descricao ? (
            <View style={styles.textSection}>
              <Text style={styles.sectionTitle}>Descrição Técnica:</Text>
              <Text style={styles.sectionBody}>{relatorio.descricao}</Text>
            </View>
          ) : null}

          {relatorio.observacoes_finais ? (
            <View style={styles.textSection}>
              <Text style={styles.sectionTitle}>Observações Finais & Recomendações:</Text>
              <Text style={styles.sectionBody}>{relatorio.observacoes_finais}</Text>
            </View>
          ) : null}
        </View>

        {/* Photos Gallery */}
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.cardSectionTitle}>Registro Fotográfico ({fotos.length})</Text>
            <TouchableOpacity onPress={() => navigation.navigate('ReportFormScreen', { reportId: relatorio.id })}>
              <Text style={styles.addPhotosText}>+ Adicionar Fotos</Text>
            </TouchableOpacity>
          </View>

          {fotos.length === 0 ? (
            <View style={styles.emptyPhotos}>
              <Ionicons name="images-outline" size={36} color={Colors.textMuted} />
              <Text style={styles.emptyPhotosText}>Nenhuma foto anexada neste relatório.</Text>
            </View>
          ) : (
            <View style={styles.photosGrid}>
              {fotos.map((item, index) => (
                <View key={item.id} style={styles.photoItem}>
                  <Image 
                    source={{ uri: item.uri_local || item.url || '' }} 
                    style={styles.photoImg} 
                  />
                  <View style={styles.photoCaptionBox}>
                    <Text style={styles.photoIndex}>Foto {index + 1}</Text>
                    <Text style={styles.photoLegenda} numberOfLines={2}>
                      {item.legenda || item.titulo || 'Sem legenda'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <TouchableOpacity 
          style={[styles.btn, styles.pdfBtn]} 
          onPress={handleExportPDF}
          disabled={loadingPdf}
        >
          {loadingPdf ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="share-social-outline" size={20} color="#FFFFFF" />
              <Text style={styles.btnText}>Exportar & Compartilhar PDF</Text>
            </>
          )}
        </TouchableOpacity>

        {relatorio.status === 'em_andamento' && (
          <TouchableOpacity 
            style={[styles.btn, styles.submitBtn]} 
            onPress={handleSubmitApproval}
          >
            <Ionicons name="paper-plane-outline" size={20} color="#FFFFFF" />
            <Text style={styles.btnText}>Enviar para Aprovação</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  reportTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.text },
  reportSubtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  cardSectionTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.text },
  addPhotosText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  label: { fontSize: 13, color: Colors.textSecondary },
  value: { fontSize: 13, color: Colors.text, fontWeight: '500' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusApproved: { backgroundColor: '#D1FAE5' },
  statusWaiting: { backgroundColor: '#FEF3C7' },
  statusProgress: { backgroundColor: '#EFF6FF' },
  statusPillText: { fontSize: 11, fontWeight: 'bold', color: '#1E293B' },
  textSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', color: '#334155', marginBottom: 4 },
  sectionBody: { fontSize: 13, color: '#475569', lineHeight: 18 },
  emptyPhotos: { padding: 24, alignItems: 'center' },
  emptyPhotosText: { fontSize: 12, color: Colors.textMuted, marginTop: 6 },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  photoItem: {
    width: '48%',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#F8FAFC',
  },
  photoImg: {
    width: '100%',
    height: 120,
    backgroundColor: '#E2E8F0',
  },
  photoCaptionBox: {
    padding: 6,
  },
  photoIndex: {
    fontSize: 10,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  photoLegenda: {
    fontSize: 11,
    color: Colors.text,
    marginTop: 2,
  },
  btn: {
    height: 50,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
    ...Shadows.sm,
  },
  pdfBtn: { backgroundColor: '#059669' },
  submitBtn: { backgroundColor: Colors.primary },
  btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },
});
