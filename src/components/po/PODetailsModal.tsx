import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, Calendar, User, Building, DollarSign, Download, MessageSquare, CheckCircle, ShoppingCart } from 'lucide-react';
import { PurchaseOrder } from '../../types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { AlertModal } from '../ui/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { updatePOStatus } from '../../services/poService';
import { format } from 'date-fns';
import { useModal } from '../../hooks/useModal';
import * as XLSX from 'xlsx';
import { formatItemCategory, formatTeamSubcategory } from '../../utils/poLineItemDisplay';

interface PODetailsModalProps {
  po: PurchaseOrder;
  isOpen: boolean;
  onClose: () => void;
  onPOUpdated?: () => void; // Callback to refresh PO data
  isGuestView?: boolean; // New prop to indicate guest view
}

export const PODetailsModal: React.FC<PODetailsModalProps> = ({ 
  po, 
  isOpen, 
  onClose, 
  onPOUpdated,
  isGuestView = false 
}) => {
  const { userProfile, isGuest, currentUser } = useAuth();
  const { alertModal, showAlert, closeAlert } = useModal();
  const [checkedItems, setCheckedItems] = useState<{ [key: string]: boolean }>({});
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Determine if we should hide comments (for guests or when explicitly requested)
  const shouldHideComments = isGuest || isGuestView;

  // Reset checked items when PO changes
  useEffect(() => {
    setCheckedItems({});
  }, [po.id]);

  if (!isOpen) return null;

  const getStatusBadge = (status: PurchaseOrder['status']) => {
    const variants = {
      draft: 'default',
      pending_approval: 'warning',
      approved: 'info',
      declined: 'danger',
      pending_purchase: 'info',
      purchased: 'success',
    } as const;

    const labels = {
      draft: 'Draft',
      pending_approval: 'Pending Approval',
      approved: 'Approved',
      declined: 'Declined',
      pending_purchase: 'Pending Purchase',
      purchased: 'Purchased',
    };

    return (
      <Badge variant={variants[status]}>
        {labels[status]}
      </Badge>
    );
  };

  const handleItemCheck = async (itemIndex: number) => {
    // Don't allow checking items for guests
    if (shouldHideComments) return;
    
    const newCheckedState = !checkedItems[itemIndex];
    
    setCheckedItems(prev => ({
      ...prev,
      [itemIndex]: newCheckedState
    }));

    // If this is the first item being checked and PO is still "approved", update to "pending_purchase"
    const anyItemsChecked = Object.values(checkedItems).some(Boolean) || newCheckedState;
    
    if (anyItemsChecked && po.status === 'approved' && userProfile?.role === 'purchaser' && currentUser) {
      setUpdatingStatus(true);
      try {
        await updatePOStatus(
          po.id, 
          'pending_purchase', 
          undefined, 
          'Purchaser has started working on this PO',
          currentUser.uid,
          userProfile.displayName
        );
        
        // Call the callback to refresh the PO data in parent components
        if (onPOUpdated) {
          onPOUpdated();
        }
        
        // Show a brief success message
        console.log('PO status updated to pending_purchase');
      } catch (error) {
        console.error('Error updating PO status:', error);
        // Revert the checkbox state if the status update failed
        setCheckedItems(prev => ({
          ...prev,
          [itemIndex]: !newCheckedState
        }));
        await showAlert({
          title: 'Error',
          message: 'Error updating PO status. Please try again.',
          variant: 'error'
        });
      } finally {
        setUpdatingStatus(false);
      }
    }
  };

  const downloadSummary = async () => {
    setDownloadLoading(true);
    try {
      console.log('Starting download summary...');
      
      // Prepare PO summary data - conditionally include fields based on guest status
      const summaryData: any = {
        'PO Name': po.name || `PO #${po.id.slice(-6).toUpperCase()}`,
        'PO Number': `#${po.id.slice(-6).toUpperCase()}`,
        'Status': po.status.charAt(0).toUpperCase() + po.status.slice(1).replace('_', ' '),
        'Created By': po.creatorName,
        'Total Amount': `$${po.totalAmount.toFixed(2)}`,
        'Created Date': po.createdAt ? format(new Date(po.createdAt.seconds * 1000), 'MMM dd, yyyy') : 'N/A',
        'Approved Date': po.approvedAt ? format(new Date(po.approvedAt.seconds * 1000), 'MMM dd, yyyy') : 'N/A',
        'Approved By': po.approvedByName || 'N/A',
        'Purchased Date': po.purchasedAt ? format(new Date(po.purchasedAt.seconds * 1000), 'MMM dd, yyyy') : 'N/A',
        'Purchased By': po.purchasedByName || 'N/A',
      };

      // Handle organization allocation properly
      if (po.organizations && po.organizations.length > 0) {
        if (po.organizations.length === 1) {
          // Single organization from new system
          summaryData['Sub-Organization'] = po.organizations[0].subOrgName;
          summaryData['Budget Allocation'] = `$${po.organizations[0].allocatedAmount.toFixed(2)} (${po.organizations[0].percentage.toFixed(1)}%)`;
          summaryData['Allocation Type'] = 'Single Organization';
        } else {
          // Multiple organizations
          summaryData['Sub-Organization'] = `Split across ${po.organizations.length} organizations`;
          summaryData['Budget Allocation'] = `Total: $${po.totalAmount.toFixed(2)} (split allocation)`;
          summaryData['Allocation Type'] = 'Multi-Organization Split';
          summaryData['Split Details'] = po.organizations
            .map(org => `${org.subOrgName}: $${org.allocatedAmount.toFixed(2)} (${org.percentage.toFixed(1)}%)`)
            .join('; ');
        }
      } else if (po.subOrgName) {
        // Legacy single organization
        summaryData['Sub-Organization'] = po.subOrgName;
        summaryData['Budget Allocation'] = `$${po.totalAmount.toFixed(2)} (100%)`;
        summaryData['Allocation Type'] = 'Legacy Single Organization';
      } else {
        // No organization assigned
        summaryData['Sub-Organization'] = 'Not Assigned';
        summaryData['Budget Allocation'] = 'Not Allocated';
        summaryData['Allocation Type'] = 'Unallocated';
      }
      // Only include special request and comments if not in guest mode
      if (!shouldHideComments) {
        summaryData['Special Request'] = po.specialRequest || 'None';
        summaryData['Over Budget Justification'] = po.overBudgetJustification || 'N/A';
        summaryData['Admin Comments'] = po.adminComments || 'None';
        summaryData['Purchaser Comments'] = po.purchaserComments || 'None';
      }

      // Prepare line items data
      const lineItemsData = po.lineItems.map((item, index) => ({
        'Item #': index + 1,
        'Team Subcategory': formatTeamSubcategory(item.teamSubcategory),
        'Type': formatItemCategory(item.itemCategory),
        'Vendor': item.vendor,
        'Item Name': item.itemName,
        'SKU': item.sku || 'N/A',
        'Quantity': item.quantity,
        'Unit Price': `$${item.unitPrice.toFixed(2)}`,
        'Total Price': `$${item.totalPrice.toFixed(2)}`,
        'Product Link': item.link || 'N/A',
        'Notes': item.notes || 'N/A',
        'Purchased': userProfile?.role === 'purchaser' && checkedItems[index] ? 'Yes' : 'No'
      }));

      console.log('Creating workbook...');
      
      // Create workbook
      const wb = XLSX.utils.book_new();

      // Add PO Summary sheet
      const summaryWs = XLSX.utils.json_to_sheet([summaryData]);
      
      // Set column widths for summary sheet
      const summaryColWidths = [
        { wch: 25 }, // Field names
        { wch: 50 }  // Values (increased for split details)
      ];
      summaryWs['!cols'] = summaryColWidths;
      
      XLSX.utils.book_append_sheet(wb, summaryWs, 'PO Summary');

      // Add Line Items sheet
      const lineItemsWs = XLSX.utils.json_to_sheet(lineItemsData);
      
      // Set column widths for line items sheet
      const lineItemsColWidths = [
        { wch: 8 },  // Item #
        { wch: 18 }, // Team Subcategory
        { wch: 14 }, // Type
        { wch: 20 }, // Vendor
        { wch: 30 }, // Item Name
        { wch: 15 }, // SKU
        { wch: 10 }, // Quantity
        { wch: 12 }, // Unit Price
        { wch: 12 }, // Total Price
        { wch: 40 }, // Product Link
        { wch: 30 }, // Notes
        { wch: 10 }  // Purchased
      ];
      lineItemsWs['!cols'] = lineItemsColWidths;
      
      XLSX.utils.book_append_sheet(wb, lineItemsWs, 'Line Items');

      // Add Budget Allocation sheet for multi-org POs
      if (po.organizations && po.organizations.length > 1) {
        const budgetData = po.organizations.map((org, index) => ({
          'Allocation #': index + 1,
          'Organization': org.subOrgName,
          'Allocated Amount': org.allocatedAmount,
          'Percentage': `${org.percentage.toFixed(1)}%`,
          'Formatted Amount': `$${org.allocatedAmount.toFixed(2)}`,
          'PO Total': po.totalAmount,
          'Formatted PO Total': `$${po.totalAmount.toFixed(2)}`
        }));

        const budgetWs = XLSX.utils.json_to_sheet(budgetData);
        
        // Set column widths for budget allocation sheet
        budgetWs['!cols'] = [
          { wch: 12 }, // Allocation #
          { wch: 25 }, // Organization
          { wch: 15 }, // Allocated Amount
          { wch: 12 }, // Percentage
          { wch: 18 }, // Formatted Amount
          { wch: 12 }, // PO Total
          { wch: 18 }  // Formatted PO Total
        ];
        
        XLSX.utils.book_append_sheet(wb, budgetWs, 'Budget Allocation');
      }
      console.log('Generating filename...');
      
      // Generate filename
      const poName = po.name || `PO_${po.id.slice(-6).toUpperCase()}`;
      const safeName = poName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const date = new Date().toISOString().split('T')[0];
      const guestSuffix = shouldHideComments ? '_guest' : '';
      const multiOrgSuffix = po.organizations && po.organizations.length > 1 ? '_multi_org' : '';
      const filename = `${safeName}_Summary${guestSuffix}${multiOrgSuffix}_${date}.xlsx`;

      console.log('Writing file:', filename);
      
      // Download file
      XLSX.writeFile(wb, filename);
      
      console.log('Download completed successfully');
      
    } catch (error) {
      console.error('Error generating PO summary:', error);
      await showAlert({
        title: 'Error',
        message: 'Error generating PO summary. Please try again.',
        variant: 'error'
      });
    } finally {
      setDownloadLoading(false);
    }
  };

  const isPurchaser = userProfile?.role === 'purchaser';
  const showCheckboxes = isPurchaser && (po.status === 'approved' || po.status === 'pending_purchase' || po.status === 'purchased') && !shouldHideComments;

  const modalContent = (
    <div 
      className="fixed bg-black bg-opacity-75 flex items-center justify-center p-4"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 999999,
        margin: 0,
        padding: '16px'
      }}
    >
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-gray-700 relative z-[1000000]">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <div className="flex items-center space-x-3">
            <h2 className="text-2xl font-bold text-gray-100">
              {po.name || `PO #${po.id.slice(-6).toUpperCase()}`}
            </h2>
            {getStatusBadge(po.status)}
            {shouldHideComments && (
              <Badge variant="info" size="sm">Read-Only</Badge>
            )}
            {updatingStatus && (
              <div className="flex items-center space-x-2 text-yellow-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-400"></div>
                <span className="text-sm">Updating status...</span>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={downloadSummary}
              loading={downloadLoading}
              disabled={downloadLoading}
            >
              <Download className="h-4 w-4 mr-2" />
              Download Summary
            </Button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center space-x-2">
              <User className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm text-gray-400">Created by</p>
                <p className="font-medium text-gray-200">{po.creatorName}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Building className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm text-gray-400">Sub-Organization</p>
                <p className="font-medium text-gray-200">
                  {po.organizations && po.organizations.length > 1 
                    ? `${po.organizations.length} Organizations` 
                    : po.subOrgName
                  }
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <DollarSign className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm text-gray-400">Total Amount</p>
                <p className="font-medium text-lg text-green-400">
                  ${po.totalAmount.toFixed(2)}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm text-gray-400">Created</p>
                <p className="font-medium text-gray-200">
                  {po.createdAt ? format(new Date(po.createdAt.seconds * 1000), 'MMM dd, yyyy') : 'N/A'}
                </p>
              </div>
            </div>
          </div>

          {/* Budget Allocation - Show for multi-organization POs */}
          {po.organizations && po.organizations.length > 1 && (
            <div className="bg-gray-700 border border-gray-600 p-4 rounded-lg">
              <h3 className="font-medium text-gray-200 mb-3 flex items-center">
                <Building className="h-4 w-4 mr-2" />
                Budget Allocation
              </h3>
              <div className="space-y-3">
                {po.organizations.map((org, index) => (
                  <div key={index} className="flex justify-between items-center p-3 bg-gray-600 rounded">
                    <div>
                      <p className="font-medium text-gray-100">{org.subOrgName}</p>
                      <p className="text-sm text-gray-400">{org.percentage.toFixed(1)}% of total</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-green-400">${org.allocatedAmount.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-600 flex justify-between items-center">
                <span className="font-medium text-gray-200">Total Allocated:</span>
                <span className="font-bold text-green-400">
                  ${po.organizations.reduce((sum, org) => sum + org.allocatedAmount, 0).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Approval and Purchase Tracking - Always show if data exists */}
          {(po.approvedByName || po.purchasedByName) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {po.approvedByName && (
                <div className="bg-green-900/30 border border-green-700 p-4 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2">
                    <CheckCircle className="h-5 w-5 text-green-400" />
                    <h3 className="font-medium text-green-300">Approved By</h3>
                  </div>
                  <p className="text-green-200 font-medium">{po.approvedByName}</p>
                  {po.approvedAt && (
                    <p className="text-green-300 text-sm mt-1">
                      {format(new Date(po.approvedAt.seconds * 1000), 'MMM dd, yyyy HH:mm')}
                    </p>
                  )}
                </div>
              )}
              
              {po.purchasedByName && (
                <div className="bg-blue-900/30 border border-blue-700 p-4 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2">
                    <ShoppingCart className="h-5 w-5 text-blue-400" />
                    <h3 className="font-medium text-blue-300">Purchased By</h3>
                  </div>
                  <p className="text-blue-200 font-medium">{po.purchasedByName}</p>
                  {po.purchasedAt && (
                    <p className="text-blue-300 text-sm mt-1">
                      {format(new Date(po.purchasedAt.seconds * 1000), 'MMM dd, yyyy HH:mm')}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Special Request - Hidden for guests */}
          {!shouldHideComments && po.specialRequest && (
            <div className="bg-blue-900/30 border border-blue-700 p-4 rounded-lg">
              <h3 className="font-medium text-blue-300 mb-2">Special Request</h3>
              <p className="text-blue-200">{po.specialRequest}</p>
            </div>
          )}

          {/* Over Budget Justification - Hidden for guests */}
          {!shouldHideComments && po.overBudgetJustification && (
            <div className="bg-yellow-900/30 border border-yellow-700 p-4 rounded-lg">
              <h3 className="font-medium text-yellow-300 mb-2">Over Budget Justification</h3>
              <p className="text-yellow-200">{po.overBudgetJustification}</p>
            </div>
          )}

          {/* Admin Comments - Hidden for guests */}
          {!shouldHideComments && po.adminComments && (
            <div className="bg-gray-700 border border-gray-600 p-4 rounded-lg">
              <h3 className="font-medium text-gray-200 mb-2">Admin Comments</h3>
              <p className="text-gray-300">{po.adminComments}</p>
            </div>
          )}

          {/* Purchaser Comments - Hidden for guests */}
          {!shouldHideComments && po.purchaserComments && (
            <div className="bg-green-900/30 border border-green-700 p-4 rounded-lg">
              <div className="flex items-start space-x-2">
                <MessageSquare className="h-4 w-4 text-green-400 mt-0.5" />
                <div>
                  <h3 className="font-medium text-green-300 mb-2">Purchaser Comments</h3>
                  <p className="text-green-200">{po.purchaserComments}</p>
                </div>
              </div>
            </div>
          )}

          {/* Purchaser Instructions - Hidden for guests */}
          {showCheckboxes && (
            <div className="bg-green-900/30 border border-green-700 p-4 rounded-lg">
              <h3 className="font-medium text-green-300 mb-2">Purchaser Instructions</h3>
              <p className="text-green-200 text-sm">
                Check off items as you purchase them. Items with checkmarks will show with strikethrough text.
                {po.status === 'approved' && (
                  <span className="block mt-1 font-medium text-green-300">
                    💡 Tip: Checking your first item will automatically update this PO status to "Pending Purchase"
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Line Items */}
          <div>
            <h3 className="text-lg font-semibold text-gray-100 mb-4">Line Items</h3>
            <div className="overflow-x-auto">
              <table className="w-full border border-gray-700 rounded-lg">
                <thead className="bg-gray-700">
                  <tr>
                    {showCheckboxes && (
                      <th className="text-center py-3 px-4 font-medium text-gray-200">✓</th>
                    )}
                    <th className="text-left py-3 px-4 font-medium text-gray-200">Item</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-200">Vendor</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-200">Team Subcategory</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-200">Item Type</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-200">SKU</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-200">Qty</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-200">Unit Price</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-200">Total</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-200">Link</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-200">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {po.lineItems.map((item, index) => {
                    const isChecked = checkedItems[index] || false;
                    const textStyle = isChecked ? 'line-through opacity-60' : '';
                    
                    return (
                      <tr key={index} className="border-t border-gray-700">
                        {showCheckboxes && (
                          <td className="py-3 px-4 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleItemCheck(index)}
                              disabled={updatingStatus}
                              className="w-4 h-4 text-green-600 bg-gray-700 border-gray-600 rounded focus:ring-green-500 focus:ring-2 disabled:opacity-50"
                            />
                          </td>
                        )}
                        <td className="py-3 px-4">
                          <div className={`font-medium text-gray-100 ${textStyle}`}>
                            {item.itemName}
                          </div>
                        </td>
                        <td className={`py-3 px-4 text-gray-300 ${textStyle}`}>
                          {item.vendor}
                        </td>
                        <td className={`py-3 px-4 text-gray-300 text-sm ${textStyle}`}>
                          {formatTeamSubcategory(item.teamSubcategory)}
                        </td>
                        <td className={`py-3 px-4 text-gray-300 text-sm ${textStyle}`}>
                          {formatItemCategory(item.itemCategory)}
                        </td>
                        <td className={`py-3 px-4 text-gray-300 ${textStyle}`}>
                          {item.sku || 'N/A'}
                        </td>
                        <td className={`py-3 px-4 text-center text-gray-300 ${textStyle}`}>
                          {item.quantity}
                        </td>
                        <td className={`py-3 px-4 text-right text-gray-300 ${textStyle}`}>
                          ${item.unitPrice.toFixed(2)}
                        </td>
                        <td className={`py-3 px-4 text-right font-medium text-green-400 ${textStyle}`}>
                          ${item.totalPrice.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {item.link ? (
                            <a
                              href={item.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`text-green-400 hover:text-green-300 ${isChecked ? 'opacity-60' : ''}`}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>
                        <td className={`py-3 px-4 text-gray-300 text-sm ${textStyle}`}>
                          {item.notes || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-700">
                  <tr>
                    <td colSpan={showCheckboxes ? 8 : 7} className="py-3 px-4 text-right font-medium text-gray-200">
                      Total Amount:
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-lg text-green-400">
                      ${po.totalAmount.toFixed(2)}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Purchase Progress for Purchasers - Hidden for guests */}
          {showCheckboxes && (
            <div className="bg-gray-700 border border-gray-600 p-4 rounded-lg">
              <h3 className="font-medium text-gray-200 mb-3">Purchase Progress</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-300">
                    Items Purchased: {Object.values(checkedItems).filter(Boolean).length} of {po.lineItems.length}
                  </p>
                  <div className="w-64 bg-gray-600 rounded-full h-2 mt-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${(Object.values(checkedItems).filter(Boolean).length / po.lineItems.length) * 100}%`
                      }}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-green-400">
                    {Math.round((Object.values(checkedItems).filter(Boolean).length / po.lineItems.length) * 100)}%
                  </p>
                  <p className="text-xs text-gray-400">Complete</p>
                </div>
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-700">
            <div>
              <p className="text-sm text-gray-400">Created At</p>
              <p className="font-medium text-gray-200">
                {po.createdAt ? format(new Date(po.createdAt.seconds * 1000), 'MMM dd, yyyy HH:mm') : 'N/A'}
              </p>
            </div>
            {po.approvedAt && (
              <div>
                <p className="text-sm text-gray-400">Approved At</p>
                <p className="font-medium text-gray-200">
                  {format(new Date(po.approvedAt.seconds * 1000), 'MMM dd, yyyy HH:mm')}
                </p>
              </div>
            )}
            {po.purchasedAt && (
              <div>
                <p className="text-sm text-gray-400">Purchased At</p>
                <p className="font-medium text-gray-200">
                  {format(new Date(po.purchasedAt.seconds * 1000), 'MMM dd, yyyy HH:mm')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-700">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </div>

      {/* Alert Modal */}
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={closeAlert}
        title={alertModal.options.title}
        message={alertModal.options.message}
        variant={alertModal.options.variant}
      />
    </div>
  );

  // Use createPortal to render the modal at the document root level
  return createPortal(modalContent, document.body);
};