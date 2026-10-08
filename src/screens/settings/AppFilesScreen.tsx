import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getLocalProjetos } from '../../database/db';
import {
  getStorageConfig,
  requestAppStorageDirectory,
  promptSelectStorageDirectory,
  getStoredPhysicalFiles,
  getProjectsFoldersSummary,
  openRootFolderExternally,
  ensureAllProjectsFolders,
  viewOrShareFile,
  FileItem,
  ProjectFolderSummary,
  StorageConfig,
} from '../../services/appFilesService';
import { Projeto } from '../../types';

type ActiveTab = 'imagens' | 'relatorios' | 'obras';

export default function AppFilesScreen() {
  const navigation = useNavigation<any>();
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [folders, setFolders] = useState<ProjectFolderSummary[]>([]);
  const [storageConfig, setStorageConfig] = useState<StorageConfig | null>(null);
  const [physicalFiles, setPhysicalFiles] = useState<{ imagens: FileItem[]; relatorios: FileItem[] }>({
    imagens: [],
    relatorios: [],
  });
  const [activeTab, setActiveTab] = useState<ActiveTab>('imagens');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [projs, dirs, config, files] = await Promise.all([
        getLocalProjetos(),
        getProjectsFoldersSummary(),
        getStorageConfig(),
        getStoredPhysicalFiles(),
      ]);
      setProjetos(projs);
      setFolders(dirs);
      setStorageConfig(config);
      setPhysicalFiles(files);
    } catch (error) {
      console.error('Erro ao listar arquivos do app:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData().then(async () => {
      // Se ainda não configurou uma pasta no Android, pergunta amigavelmente
      const config = await getStorageConfig();
      if (!config.isConfigured) {
        promptSelectStorageDirectory(false).then((res) => {
          if (res.success) {
            loadData();
          }
        });
      }
    });
  }, [loadData]);

  const handleSelectDirectory = async () => {
    try {
      setSyncing(true);
      const res = await requestAppStorageDirectory();
      if (res.success) {
        Alert.alert(
          'Pasta Configurada com Sucesso!',
          'As pastas "Imagens" e "Relatórios" foram criadas no diretório selecionado. Seus arquivos serão salvos lá separadamente.'
        );
        await loadData();
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Não foi possível selecionar o diretório.');
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenExternal = async () => {
    try {
      await openRootFolderExternally();
    } catch (error) {
      Alert.alert('Aviso', 'Não foi possível abrir o gerenciador automaticamente.');
    }
  };

  const handleOpenFile = async (file: FileItem, type: 'image' | 'pdf') => {
    try {
      await viewOrShareFile(file.uri, type === 'pdf' ? 'application/pdf' : 'image/jpeg');
    } catch (err: any) {
      Alert.alert('Erro ao abrir', err?.message || 'Não foi possível abrir o arquivo.');
    }
  };

  const handleSyncAllFolders = async () => {
    try {
      setSyncing(true);
      await ensureAllProjectsFolders();
      await loadData();
      Alert.alert(
        'Pastas Verificadas',
        'As pastas de todas as obras foram sincronizadas com sucesso.'
      );
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível sincronizar as pastas.');
    } finally {
      setSyncing(false);
    }
  };

  const renderFileCard = (file: FileItem, type: 'image' | 'pdf') => {
    const isPdf = type === 'pdf';
    return (
      <TouchableOpacity
        key={file.uri}
        style={styles.fileCard}
        activeOpacity={0.7}
        onPress={() => handleOpenFile(file, type)}
      >
        <View style={[styles.fileIconWrap, isPdf ? styles.pdfIconWrap : styles.imgIconWrap]}>
          <Ionicons
            name={isPdf ? 'document-text' : 'image'}
            size={24}
            color={isPdf ? '#DC2626' : '#2563EB'}
          />
        </View>

        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={2}>
            {file.name}
          </Text>
          <Text style={styles.fileSubtext}>
            {isPdf ? 'Relatório PDF' : 'Foto da Obra'} • Toque para abrir/compartilhar
          </Text>
        </View>

        <View style={styles.fileActionBtn}>
          <Ionicons name="share-outline" size={20} color="#64748B" />
        </View>
      </TouchableOpacity>
    );
  };

  const renderObraCard = ({ item }: { item: Projeto }) => {
    const projFolder = folders.find(
      (f) =>
        f.projectName.toLowerCase().includes(item.nome.toLowerCase()) ||
        item.nome.toLowerCase().includes(f.projectName.toLowerCase())
    );
    const imgCount = projFolder?.imagens?.length ?? 0;
    const pdfCount = projFolder?.pdfs?.length ?? 0;

    return (
      <View style={styles.obraCard}>
        <View style={styles.folderIconWrap}>
          <Ionicons name="folder" size={28} color="#F59E0B" />
        </View>

        <View style={styles.infoCol}>
          <Text style={styles.projectName} numberOfLines={1}>
            {item.numero ? `[${item.numero}] ` : ''}{item.nome}
          </Text>
          <Text style={styles.projectClient} numberOfLines={1}>
            {item.construtora || 'ObraFlow'} • {item.tipo_obra || 'Edificação'}
          </Text>

          <View style={styles.subfolderTags}>
            <View style={styles.subfolderTag}>
              <Ionicons name="images-outline" size={13} color="#2563EB" />
              <Text style={styles.subfolderTagText}>Imagens ({imgCount})</Text>
            </View>
            <View style={styles.subfolderTag}>
              <Ionicons name="document-text-outline" size={13} color="#DC2626" />
              <Text style={styles.subfolderTagText}>Relatórios ({pdfCount})</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const totalImagens = physicalFiles.imagens.length;
  const totalRelatorios = physicalFiles.relatorios.length;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1E293B" />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Arquivos do App</Text>
          <Text style={styles.headerSubtitle}>Armazenamento local de Imagens e Relatórios</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Card de Configuração do Diretório de Armazenamento */}
        <View style={[styles.storageCard, !storageConfig?.isConfigured && styles.storageCardWarning]}>
          <View style={styles.storageCardHeader}>
            <View
              style={[
                styles.storageBadgeIcon,
                storageConfig?.isConfigured ? styles.badgeSuccess : styles.badgeWarning,
              ]}
            >
              <Ionicons
                name={storageConfig?.isConfigured ? 'checkmark-circle' : 'alert-circle'}
                size={22}
                color={storageConfig?.isConfigured ? '#16A34A' : '#D97706'}
              />
            </View>
            <View style={styles.storageCardHeaderText}>
              <Text style={styles.storageStatusTitle}>
                {storageConfig?.isConfigured
                  ? 'Pasta Vinculada no Aparelho'
                  : 'Pasta do Celular Não Selecionada'}
              </Text>
              <Text style={styles.storagePathName} numberOfLines={1}>
                {storageConfig?.directoryName || 'Armazenamento padrão do app'}
              </Text>
            </View>
          </View>

          <Text style={styles.storageDescText}>
            {storageConfig?.isConfigured
              ? 'As pastas "Imagens" e "Relatórios" foram criadas e estão recebendo todos os arquivos separadamente.'
              : 'O app precisa da permissão em uma pasta do celular. Após escolher, criaremos automaticamente as pastas "Imagens" e "Relatórios".'}
          </Text>

          <View style={styles.storageActionRow}>
            <TouchableOpacity
              style={[styles.primarySelectBtn, syncing && styles.btnDisabled]}
              onPress={handleSelectDirectory}
              disabled={syncing}
            >
              <Ionicons name="folder-open" size={16} color="#FFFFFF" />
              <Text style={styles.primarySelectBtnText}>
                {storageConfig?.isConfigured ? 'Alterar Pasta' : 'Selecionar Pasta de Armazenamento'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryOpenBtn} onPress={handleOpenExternal}>
              <Ionicons name="open-outline" size={16} color="#0F172A" />
              <Text style={styles.secondaryOpenBtnText}>Abrir no Gerenciador</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Abas das Pastas */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'imagens' && styles.tabButtonActive]}
            onPress={() => setActiveTab('imagens')}
          >
            <Ionicons
              name="images"
              size={18}
              color={activeTab === 'imagens' ? '#2563EB' : '#64748B'}
            />
            <Text
              style={[styles.tabButtonText, activeTab === 'imagens' && styles.tabButtonTextActive]}
            >
              Imagens ({totalImagens})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'relatorios' && styles.tabButtonActive]}
            onPress={() => setActiveTab('relatorios')}
          >
            <Ionicons
              name="document-text"
              size={18}
              color={activeTab === 'relatorios' ? '#DC2626' : '#64748B'}
            />
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'relatorios' && styles.tabButtonTextActive,
              ]}
            >
              Relatórios ({totalRelatorios})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'obras' && styles.tabButtonActive]}
            onPress={() => setActiveTab('obras')}
          >
            <Ionicons
              name="business"
              size={18}
              color={activeTab === 'obras' ? '#0F172A' : '#64748B'}
            />
            <Text
              style={[styles.tabButtonText, activeTab === 'obras' && styles.tabButtonTextActive]}
            >
              Por Obra ({projetos.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Conteúdo da Aba */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.loadingText}>Carregando arquivos salvos...</Text>
          </View>
        ) : activeTab === 'imagens' ? (
          <View style={styles.tabSection}>
            <View style={styles.folderNotice}>
              <Ionicons name="information-circle" size={16} color="#2563EB" />
              <Text style={styles.folderNoticeText}>
                Pasta <Text style={styles.bold}>Imagens</Text>: Todas as fotos capturadas e anexadas são salvas fisicamente nesta pasta.
              </Text>
            </View>

            {physicalFiles.imagens.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="images-outline" size={48} color="#94A3B8" />
                <Text style={styles.emptyTitle}>Nenhuma foto encontrada</Text>
                <Text style={styles.emptyText}>
                  Tire fotos em relatórios ou vistorias para salvá-las na pasta Imagens.
                </Text>
              </View>
            ) : (
              physicalFiles.imagens.map((file) => renderFileCard(file, 'image'))
            )}
          </View>
        ) : activeTab === 'relatorios' ? (
          <View style={styles.tabSection}>
            <View style={styles.folderNotice}>
              <Ionicons name="information-circle" size={16} color="#DC2626" />
              <Text style={styles.folderNoticeText}>
                Pasta <Text style={styles.bold}>Relatórios</Text>: Todos os laudos e relatórios em PDF são salvos fisicamente nesta pasta.
              </Text>
            </View>

            {physicalFiles.relatorios.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="document-text-outline" size={48} color="#94A3B8" />
                <Text style={styles.emptyTitle}>Nenhum relatório em PDF</Text>
                <Text style={styles.emptyText}>
                  Gere ou aprove relatórios para que os PDFs sejam salvos aqui automaticamente.
                </Text>
              </View>
            ) : (
              physicalFiles.relatorios.map((file) => renderFileCard(file, 'pdf'))
            )}
          </View>
        ) : (
          <View style={styles.tabSection}>
            <View style={styles.listHeaderRow}>
              <Text style={styles.sectionTitle}>Pastas por Obra ({projetos.length})</Text>
              <TouchableOpacity
                style={styles.syncBtn}
                onPress={handleSyncAllFolders}
                disabled={syncing}
              >
                {syncing ? (
                  <ActivityIndicator size="small" color="#2563EB" />
                ) : (
                  <>
                    <Ionicons name="sync" size={14} color="#2563EB" />
                    <Text style={styles.syncBtnText}>Atualizar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {projetos.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="folder-open-outline" size={48} color="#94A3B8" />
                <Text style={styles.emptyTitle}>Nenhuma obra cadastrada</Text>
                <Text style={styles.emptyText}>
                  As pastas são criadas automaticamente para cada nova obra.
                </Text>
              </View>
            ) : (
              projetos.map((item) => <View key={item.id}>{renderObraCard({ item })}</View>)
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  storageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  storageCardWarning: {
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
  },
  storageCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  storageBadgeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeSuccess: {
    backgroundColor: '#DCFCE7',
  },
  badgeWarning: {
    backgroundColor: '#FEF3C7',
  },
  storageCardHeaderText: {
    flex: 1,
  },
  storageStatusTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  storagePathName: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  storageDescText: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 14,
  },
  storageActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primarySelectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  primarySelectBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  secondaryOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  secondaryOpenBtnText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#F1F5F9',
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabButtonTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  tabSection: {
    gap: 10,
  },
  folderNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 6,
  },
  folderNoticeText: {
    flex: 1,
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
  },
  bold: {
    fontWeight: '700',
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  fileIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imgIconWrap: {
    backgroundColor: '#EFF6FF',
  },
  pdfIconWrap: {
    backgroundColor: '#FEF2F2',
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  fileSubtext: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  fileActionBtn: {
    padding: 6,
  },
  obraCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    gap: 12,
  },
  folderIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoCol: {
    flex: 1,
  },
  projectName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  projectClient: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  subfolderTags: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  subfolderTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  subfolderTagText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '500',
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#EFF6FF',
  },
  syncBtnText: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '600',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 10,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 10,
  },
  emptyText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 24,
  },
});
