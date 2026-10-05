import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, Modal, TouchableOpacity, Image, 
  TextInput, Dimensions, Alert, ScrollView 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CANVAS_SIZE = Math.min(SCREEN_WIDTH - 24, 380);

export interface AnnotationItem {
  id: string;
  type: 'arrow' | 'rect' | 'circle' | 'text';
  x: number;      // percent 0 - 100
  y: number;      // percent 0 - 100
  size?: number;  // for circle / rect scale
  text?: string;
  color: string;
}

interface PhotoEditorModalProps {
  visible: boolean;
  photoUri: string | null;
  initialAnnotations?: string; // JSON string
  onClose: () => void;
  onSave: (annotationsJson: string) => void;
}

const COLOR_PALETTE = [
  '#EF4444', // Red
  '#F59E0B', // Amber/Yellow
  '#10B981', // Green
  '#3B82F6', // Blue
  '#FFFFFF', // White
  '#000000', // Black
];

export const PhotoEditorModal: React.FC<PhotoEditorModalProps> = ({
  visible,
  photoUri,
  initialAnnotations,
  onClose,
  onSave,
}) => {
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [selectedTool, setSelectedTool] = useState<'arrow' | 'rect' | 'circle' | 'text'>('arrow');
  const [selectedColor, setSelectedColor] = useState('#EF4444');
  const [textInputVal, setTextInputVal] = useState('Fissura');
  const [showTextInputModal, setShowTextInputModal] = useState(false);

  React.useEffect(() => {
    if (visible) {
      if (initialAnnotations) {
        try {
          const parsed = typeof initialAnnotations === 'string' ? JSON.parse(initialAnnotations) : initialAnnotations;
          if (Array.isArray(parsed)) {
            setAnnotations(parsed);
          } else {
            setAnnotations([]);
          }
        } catch {
          setAnnotations([]);
        }
      } else {
        setAnnotations([]);
      }
    }
  }, [visible, initialAnnotations]);

  function handleCanvasTouch(e: any) {
    const { locationX, locationY } = e.nativeEvent;
    const xPct = Math.max(5, Math.min(95, (locationX / CANVAS_SIZE) * 100));
    const yPct = Math.max(5, Math.min(95, (locationY / CANVAS_SIZE) * 100));

    if (selectedTool === 'text') {
      setShowTextInputModal(true);
      setPendingTextPos({ x: xPct, y: yPct });
      return;
    }

    const newItem: AnnotationItem = {
      id: Date.now().toString(),
      type: selectedTool,
      x: xPct,
      y: yPct,
      color: selectedColor,
      size: 40,
    };

    setAnnotations(prev => [...prev, newItem]);
  }

  const [pendingTextPos, setPendingTextPos] = useState<{ x: number; y: number } | null>(null);

  function handleConfirmText() {
    if (pendingTextPos && textInputVal.trim()) {
      const newItem: AnnotationItem = {
        id: Date.now().toString(),
        type: 'text',
        x: pendingTextPos.x,
        y: pendingTextPos.y,
        text: textInputVal.trim(),
        color: selectedColor,
      };
      setAnnotations(prev => [...prev, newItem]);
    }
    setShowTextInputModal(false);
    setPendingTextPos(null);
  }

  function handleUndo() {
    setAnnotations(prev => prev.slice(0, prev.length - 1));
  }

  function handleClear() {
    if (annotations.length === 0) return;
    Alert.alert('Limpar Anotações', 'Deseja remover todas as marcações da foto?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Limpar', style: 'destructive', onPress: () => setAnnotations([]) },
    ]);
  }

  function handleSave() {
    onSave(JSON.stringify(annotations));
    onClose();
  }

  if (!visible || !photoUri) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        {/* Top Header Bar */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
            <Text style={styles.headerBtnText}>Cancelar</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Editar Foto & Formas</Text>
          <TouchableOpacity onPress={handleSave} style={[styles.headerBtn, styles.saveBtn]}>
            <Ionicons name="checkmark" size={20} color="#FFFFFF" />
            <Text style={styles.headerBtnText}>Salvar</Text>
          </TouchableOpacity>
        </View>

        {/* Tip Banner */}
        <View style={styles.tipBanner}>
          <Ionicons name="finger-print-outline" size={16} color="#94A3B8" />
          <Text style={styles.tipText}>
            Toque na foto para aplicar a marcação ({selectedTool === 'arrow' ? 'Seta' : selectedTool === 'rect' ? 'Retângulo' : selectedTool === 'circle' ? 'Círculo' : 'Texto'}).
          </Text>
        </View>

        {/* Image Canvas with Touch Responder */}
        <View style={styles.canvasContainer}>
          <TouchableOpacity 
            activeOpacity={1}
            onPress={handleCanvasTouch}
            style={[styles.canvasBox, { width: CANVAS_SIZE, height: CANVAS_SIZE }]}
          >
            <Image 
              source={{ uri: photoUri }} 
              style={styles.image} 
              resizeMode="contain" 
            />

            {/* Render Annotations Overlay */}
            {annotations.map(item => (
              <View 
                key={item.id} 
                style={[styles.annotationItem, { left: `${item.x}%`, top: `${item.y}%` }]}
                pointerEvents="none"
              >
                {item.type === 'arrow' && (
                  <View style={styles.arrowContainer}>
                    <Ionicons name="arrow-back" size={32} color={item.color} style={{ transform: [{ rotate: '-45deg' }] }} />
                    <View style={[styles.arrowDot, { backgroundColor: item.color }]} />
                  </View>
                )}

                {item.type === 'rect' && (
                  <View 
                    style={[
                      styles.rectShape, 
                      { borderColor: item.color, width: (item.size || 40) * 1.5, height: item.size || 40 }
                    ]} 
                  />
                )}

                {item.type === 'circle' && (
                  <View 
                    style={[
                      styles.circleShape, 
                      { borderColor: item.color, width: item.size || 45, height: item.size || 45 }
                    ]} 
                  />
                )}

                {item.type === 'text' && (
                  <View style={[styles.textBadge, { backgroundColor: item.color }]}>
                    <Text style={[styles.badgeText, { color: item.color === '#FFFFFF' ? '#000000' : '#FFFFFF' }]}>
                      {item.text}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </TouchableOpacity>
        </View>

        {/* Action Controls & Tools */}
        <View style={styles.controlsSection}>
          {/* Tool Selector */}
          <Text style={styles.controlLabel}>Ferramenta:</Text>
          <View style={styles.toolRow}>
            <TouchableOpacity 
              style={[styles.toolBtn, selectedTool === 'arrow' && styles.toolBtnActive]}
              onPress={() => setSelectedTool('arrow')}
            >
              <Ionicons name="arrow-redo-outline" size={20} color={selectedTool === 'arrow' ? '#FFFFFF' : '#94A3B8'} />
              <Text style={[styles.toolText, selectedTool === 'arrow' && styles.toolTextActive]}>Seta</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.toolBtn, selectedTool === 'rect' && styles.toolBtnActive]}
              onPress={() => setSelectedTool('rect')}
            >
              <Ionicons name="square-outline" size={20} color={selectedTool === 'rect' ? '#FFFFFF' : '#94A3B8'} />
              <Text style={[styles.toolText, selectedTool === 'rect' && styles.toolTextActive]}>Retângulo</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.toolBtn, selectedTool === 'circle' && styles.toolBtnActive]}
              onPress={() => setSelectedTool('circle')}
            >
              <Ionicons name="ellipse-outline" size={20} color={selectedTool === 'circle' ? '#FFFFFF' : '#94A3B8'} />
              <Text style={[styles.toolText, selectedTool === 'circle' && styles.toolTextActive]}>Círculo</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.toolBtn, selectedTool === 'text' && styles.toolBtnActive]}
              onPress={() => setSelectedTool('text')}
            >
              <Ionicons name="text-outline" size={20} color={selectedTool === 'text' ? '#FFFFFF' : '#94A3B8'} />
              <Text style={[styles.toolText, selectedTool === 'text' && styles.toolTextActive]}>Texto</Text>
            </TouchableOpacity>
          </View>

          {/* Color Selector */}
          <Text style={styles.controlLabel}>Cor da Marcação:</Text>
          <View style={styles.colorRow}>
            {COLOR_PALETTE.map(color => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorCircle,
                  { backgroundColor: color },
                  selectedColor === color && styles.colorCircleActive,
                ]}
                onPress={() => setSelectedColor(color)}
              />
            ))}
          </View>

          {/* Undo / Clear Buttons */}
          <View style={styles.bottomActionsRow}>
            <TouchableOpacity 
              style={[styles.actionBtn, annotations.length === 0 && { opacity: 0.4 }]}
              onPress={handleUndo}
              disabled={annotations.length === 0}
            >
              <Ionicons name="arrow-undo-outline" size={18} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>Desfazer</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionBtn, styles.clearBtn, annotations.length === 0 && { opacity: 0.4 }]}
              onPress={handleClear}
              disabled={annotations.length === 0}
            >
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
              <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Limpar Tudo</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Modal for Typing Text Annotation */}
        <Modal visible={showTextInputModal} transparent animationType="fade">
          <View style={styles.textModalOverlay}>
            <View style={styles.textModalCard}>
              <Text style={styles.textModalTitle}>Texto da Marcação</Text>
              <TextInput
                style={styles.textModalInput}
                value={textInputVal}
                onChangeText={setTextInputVal}
                placeholder="Ex: Fissura, Umidade, Falha"
                autoFocus
              />
              <View style={styles.quickTagsRow}>
                {['Fissura', 'Infiltração', 'Descolamento', 'Pintura', 'Ajustar'].map(tag => (
                  <TouchableOpacity 
                    key={tag} 
                    style={styles.quickTag}
                    onPress={() => setTextInputVal(tag)}
                  >
                    <Text style={styles.quickTagText}>{tag}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.textModalBtnRow}>
                <TouchableOpacity 
                  style={[styles.textModalBtn, styles.textModalBtnCancel]} 
                  onPress={() => setShowTextInputModal(false)}
                >
                  <Text style={styles.textModalBtnTextCancel}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.textModalBtn, styles.textModalBtnConfirm]} 
                  onPress={handleConfirmText}
                >
                  <Text style={styles.textModalBtnTextConfirm}>Inserir na Foto</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
};

/**
 * Helper component to render saved annotations over any photo thumbnail or card
 */
export const PhotoAnnotationOverlay: React.FC<{ annotationsJson?: string }> = ({ annotationsJson }) => {
  if (!annotationsJson) return null;
  let items: AnnotationItem[] = [];
  try {
    items = typeof annotationsJson === 'string' ? JSON.parse(annotationsJson) : annotationsJson;
    if (!Array.isArray(items)) return null;
  } catch {
    return null;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {items.map(item => (
        <View 
          key={item.id} 
          style={[styles.annotationItem, { left: `${item.x}%`, top: `${item.y}%` }]}
        >
          {item.type === 'arrow' && (
            <Ionicons name="arrow-back" size={24} color={item.color} style={{ transform: [{ rotate: '-45deg' }] }} />
          )}
          {item.type === 'rect' && (
            <View 
              style={[
                styles.rectShape, 
                { borderColor: item.color, width: (item.size || 30) * 1.3, height: item.size || 30 }
              ]} 
            />
          )}
          {item.type === 'circle' && (
            <View 
              style={[
                styles.circleShape, 
                { borderColor: item.color, width: item.size || 32, height: item.size || 32 }
              ]} 
            />
          )}
          {item.type === 'text' && (
            <View style={[styles.textBadge, { backgroundColor: item.color, paddingHorizontal: 6, paddingVertical: 2 }]}>
              <Text style={[styles.badgeText, { fontSize: 10, color: item.color === '#FFFFFF' ? '#000000' : '#FFFFFF' }]}>
                {item.text}
              </Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  saveBtn: {
    backgroundColor: '#10B981',
  },
  headerBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  tipBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tipText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  canvasContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  canvasBox: {
    backgroundColor: '#000000',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#334155',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  annotationItem: {
    position: 'absolute',
    transform: [{ translateX: -15 }, { translateY: -15 }],
  },
  arrowContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    position: 'absolute',
    bottom: 2,
    right: 2,
  },
  rectShape: {
    borderWidth: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  circleShape: {
    borderWidth: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  textBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  badgeText: {
    fontWeight: 'bold',
    fontSize: 12,
  },
  controlsSection: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  controlLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  toolRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  toolBtn: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    gap: 4,
  },
  toolBtnActive: {
    backgroundColor: '#3B82F6',
  },
  toolText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  toolTextActive: {
    color: '#FFFFFF',
  },
  colorRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#475569',
  },
  colorCircleActive: {
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.2 }],
  },
  bottomActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    height: 42,
    backgroundColor: '#334155',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  clearBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  textModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  textModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
  },
  textModalTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  textModalInput: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    color: '#FFFFFF',
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    marginBottom: 12,
  },
  quickTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  quickTag: {
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  quickTagText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  textModalBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  textModalBtn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textModalBtnCancel: {
    backgroundColor: '#334155',
  },
  textModalBtnConfirm: {
    backgroundColor: '#3B82F6',
  },
  textModalBtnTextCancel: {
    color: '#94A3B8',
    fontWeight: '600',
  },
  textModalBtnTextConfirm: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
