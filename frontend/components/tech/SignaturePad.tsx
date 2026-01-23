/**
 * SignaturePad Component
 * Captures customer signature using react-native-signature-canvas
 */

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';

interface SignaturePadProps {
  onSave: (signature: string) => void;
  signature?: string | null;
  customerName?: string;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function SignaturePad({
  onSave,
  signature,
  customerName,
}: SignaturePadProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const signatureRef = useRef<SignatureViewRef>(null);

  const handleSignature = (sig: string) => {
    onSave(sig);
    setModalVisible(false);
  };

  const handleClear = () => {
    signatureRef.current?.clearSignature();
  };

  const handleConfirm = () => {
    signatureRef.current?.readSignature();
  };

  const handleEmpty = () => {
    console.log('Signature is empty');
  };

  const style = `.m-signature-pad--footer { display: none; }
    .m-signature-pad { box-shadow: none; border: none; }
    .m-signature-pad--body { border: none; }
    body, html { background-color: #f9fafb; }
    canvas { background-color: #ffffff; border-radius: 8px; }`;

  return (
    <>
      {/* Signature Preview/Button */}
      <TouchableOpacity
        style={styles.signatureBox}
        onPress={() => setModalVisible(true)}
      >
        {signature ? (
          <View style={styles.signaturePreview}>
            <Text style={styles.signatureLabel}>Signed by {customerName || 'Customer'}</Text>
            <View style={styles.signatureImageContainer}>
              {/* Show checkmark since we have signature */}
              <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
              <Text style={styles.signedText}>Signature captured</Text>
            </View>
            <TouchableOpacity
              style={styles.changeButton}
              onPress={() => setModalVisible(true)}
            >
              <Text style={styles.changeButtonText}>Change Signature</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.emptySignature}>
            <Ionicons name="create-outline" size={32} color={Colors.gray400} />
            <Text style={styles.signatureText}>Tap to capture signature</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Full Screen Signature Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setModalVisible(false)}
            >
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Customer Signature</Text>
            <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
              <Text style={styles.clearButtonText}>Clear</Text>
            </TouchableOpacity>
          </View>

          {/* Instructions */}
          <View style={styles.instructions}>
            <Text style={styles.instructionsText}>
              Please sign below to confirm job completion
            </Text>
            {customerName && (
              <Text style={styles.customerNameText}>{customerName}</Text>
            )}
          </View>

          {/* Signature Canvas */}
          <View style={styles.canvasContainer}>
            <SignatureScreen
              ref={signatureRef}
              onOK={handleSignature}
              onEmpty={handleEmpty}
              webStyle={style}
              backgroundColor={Colors.white}
              penColor={Colors.text}
              minWidth={2}
              maxWidth={4}
              dotSize={3}
              trimWhitespace
              imageType="image/png"
            />
            <View style={styles.signatureLine}>
              <View style={styles.line} />
              <Text style={styles.signHereText}>Sign here</Text>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleConfirm}
            >
              <Ionicons name="checkmark" size={20} color={Colors.white} />
              <Text style={styles.confirmButtonText}>Confirm Signature</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  signatureBox: {
    height: 120,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.gray50,
    overflow: 'hidden',
  },
  emptySignature: {
    alignItems: 'center',
  },
  signatureText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray400,
    marginTop: Spacing.sm,
  },
  signaturePreview: {
    width: '100%',
    height: '100%',
    padding: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signatureLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  signatureImageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  signedText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.success,
    marginTop: Spacing.xs,
  },
  changeButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  changeButtonText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  clearButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  clearButtonText: {
    fontSize: Typography.fontSize.base,
    color: Colors.error,
    fontWeight: Typography.fontWeight.medium,
  },
  instructions: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  instructionsText: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  customerNameText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  canvasContainer: {
    flex: 1,
    margin: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  signatureLine: {
    position: 'absolute',
    bottom: 60,
    left: Spacing.lg,
    right: Spacing.lg,
    alignItems: 'center',
  },
  line: {
    width: '100%',
    height: 1,
    backgroundColor: Colors.gray300,
  },
  signHereText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.gray400,
    marginTop: 4,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textSecondary,
  },
  confirmButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
  },
  confirmButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.white,
  },
});
