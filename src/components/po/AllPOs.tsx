import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ConfirmModal, AlertModal } from '../ui/Modal';
import { Search, Eye, Trash2, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getAllPOs, deletePO } from '../../services/poService';
import { getSubOrganizations } from '../../services/subOrgService';
import { PurchaseOrder, SubOrganization } from '../../types';
import { PODetailsModal } from './PODetailsModal';
import { useAuth } from '../../contexts/AuthContext';
import { GuestAllPOs } from './GuestAllPOs';
import { useModal } from '../../hooks/useModal';
import {
  formatPoDay,
  lineItemsSearchHaystack,
  poMatchesLineItemCategory,
  poMatchesLineSubcategory,
  poTimestampSeconds,
} from '../../utils/poFilters';
import { formatItemCategory, formatTeamSubcategory } from '../../utils/poLineItemDisplay';

export const AllPOs: React.FC = () => {
  const { isGuest } = useAuth();
  const { confirmModal, alertModal, showConfirm, showAlert, closeConfirm, closeAlert, setConfirmLoading } = useModal();
  const [pos, setPOs] = useState<PurchaseOrder[]>([]);
  const [subOrgs, setSubOrgs] = useState<SubOrganization[]>([]);
  const [filteredPOs, setFilteredPOs] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [subOrgFilter, setSubOrgFilter] = useState<string>('all');
  const [teamSubcategoryFilter, setTeamSubcategoryFilter] = useState<string>('all');
  const [itemCategoryFilter, setItemCategoryFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // If user is a guest, show the guest version
  if (isGuest) {
    return <GuestAllPOs />;
  }

  useEffect(() => {
    fetchAllPOs();
    fetchSubOrganizations();
  }, []);

  useEffect(() => {
    let filtered = pos;

    if (statusFilter !== 'all') {
      filtered = filtered.filter(po => po.status === statusFilter);
    }

    if (subOrgFilter !== 'all') {
      filtered = filtered.filter(po => {
        // Check legacy single allocation
        if (po.subOrgId === subOrgFilter) return true;
        
        // Check multi-organization POs
        if (po.organizations && po.organizations.length > 0) {
          return po.organizations.some(org => org.subOrgId === subOrgFilter);
        }
        
        return false;
      });
    }

    if (teamSubcategoryFilter !== 'all') {
      filtered = filtered.filter(po =>
        poMatchesLineSubcategory(po, teamSubcategoryFilter as 'mechanical' | 'electrical')
      );
    }

    if (itemCategoryFilter !== 'all') {
      filtered = filtered.filter(po =>
        poMatchesLineItemCategory(
          po,
          itemCategoryFilter as 'consumable' | 'part' | 'miscellaneous'
        )
      );
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(po =>
        po.creatorName.toLowerCase().includes(q) ||
        (po.subOrgName && po.subOrgName.toLowerCase().includes(q)) ||
        (po.organizations &&
          po.organizations.some(org => org.subOrgName.toLowerCase().includes(q))) ||
        po.id.toLowerCase().includes(q) ||
        (po.name && po.name.toLowerCase().includes(q)) ||
        lineItemsSearchHaystack(po).includes(q)
      );
    }

    setFilteredPOs(filtered);
  }, [pos, statusFilter, subOrgFilter, teamSubcategoryFilter, itemCategoryFilter, searchTerm]);

  const fetchAllPOs = async () => {
    try {
      const allPOs = await getAllPOs();
      setPOs(allPOs);
      setFilteredPOs(allPOs);
    } catch (error) {
      console.error('Error fetching all POs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubOrganizations = async () => {
    try {
      const organizations = await getSubOrganizations();
      setSubOrgs(organizations);
    } catch (error) {
      console.error('Error fetching sub-organizations:', error);
    }
  };

  const handleDeletePO = async (poId: string, poName: string) => {
    const confirmed = await showConfirm({
      title: 'Delete Purchase Order',
      message: `Are you sure you want to delete "${poName}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    });

    if (!confirmed) return;

    setConfirmLoading(true);
    try {
      await deletePO(poId);
      await fetchAllPOs(); // Refresh the list
      await showAlert({
        title: 'Success',
        message: 'Purchase Order deleted successfully',
        variant: 'success'
      });
    } catch (error) {
      console.error('Error deleting PO:', error);
      await showAlert({
        title: 'Error',
        message: 'Error deleting Purchase Order. Please try again.',
        variant: 'error'
      });
    } finally {
      setConfirmLoading(false);
    }
  };

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

  const handleViewDetails = (po: PurchaseOrder) => {
    setSelectedPO(po);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedPO(null);
  };

  const handlePOUpdated = () => {
    // Refresh the PO list when a PO is updated from the modal
    fetchAllPOs();
  };

  // Group and sort POs by status
  const groupPOsByStatus = (pos: PurchaseOrder[]) => {
    const statusOrder = ['pending_approval', 'approved', 'pending_purchase', 'draft', 'declined', 'purchased'];
    const statusLabels = {
      draft: 'Drafts',
      pending_approval: 'Pending Approval',
      approved: 'Approved',
      pending_purchase: 'Pending Purchase',
      declined: 'Declined',
      purchased: 'Purchased',
    };

    const grouped: { [key: string]: PurchaseOrder[] } = {};
    
    // Group POs by status
    pos.forEach(po => {
      if (!grouped[po.status]) {
        grouped[po.status] = [];
      }
      grouped[po.status].push(po);
    });

    // Sort within each group by newest first
    Object.keys(grouped).forEach(status => {
      grouped[status].sort((a, b) => poTimestampSeconds(b) - poTimestampSeconds(a));
    });

    // Return in the desired order
    return statusOrder
      .filter(status => grouped[status] && grouped[status].length > 0)
      .map(status => ({
        status,
        label: statusLabels[status as keyof typeof statusLabels],
        pos: grouped[status],
        count: grouped[status].length
      }));
  };

  const groupedPOs = groupPOsByStatus(filteredPOs);

  const exportFilteredToExcel = () => {
    const sorted = [...filteredPOs].sort(
      (a, b) => poTimestampSeconds(b) - poTimestampSeconds(a)
    );
    const date = new Date().toISOString().split('T')[0];

    const poOverview = sorted.map(po => ({
      'PO Name': po.name || `PO #${po.id.slice(-6).toUpperCase()}`,
      Status: po.status.replace(/_/g, ' '),
      Creator: po.creatorName,
      'Approved By': po.approvedByName || '',
      'Purchased By': po.purchasedByName || '',
      'Sub-Organization': po.subOrgName || '',
      'Total Amount': po.totalAmount,
      'Line Item Count': po.lineItems.length,
      Created: formatPoDay(po.createdAt),
    }));

    const lineRows: Record<string, string | number>[] = [];
    sorted.forEach(po => {
      po.lineItems.forEach((item, index) => {
        lineRows.push({
          'PO Name': po.name || `PO #${po.id.slice(-6).toUpperCase()}`,
          Status: po.status.replace(/_/g, ' '),
          'Line #': index + 1,
          'Team Subcategory': formatTeamSubcategory(item.teamSubcategory),
          Type: formatItemCategory(item.itemCategory),
          Vendor: item.vendor,
          'Item Name': item.itemName,
          SKU: item.sku || '',
          Quantity: item.quantity,
          'Unit Price': item.unitPrice,
          'Line Total': item.totalPrice,
          Link: item.link || '',
          Notes: item.notes || '',
        });
      });
    });

    const wb = XLSX.utils.book_new();
    const wsPo = XLSX.utils.json_to_sheet(poOverview);
    
    wsPo['!cols'] = [
      { wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 20 },{ wch: 24 },
      { wch: 14}, { wch: 12 }, { wch: 14 },
    ];
    var colIndex = XLSX.utils.decode_col("G"); // Target column B (0-indexed as 1)
    var range = XLSX.utils.decode_range(wsPo['!ref']!);

    for (var i = range.s.r + 1; i <= range.e.r; ++i) { // Start at s.r + 1 to skip header
      var cellRef = XLSX.utils.encode_cell({ r: i, c: colIndex });
      if (!wsPo[cellRef]) continue;
      
      // Ensure the cell is treated as a number ('n')
      if (wsPo[cellRef].t === 'n') {
        wsPo[cellRef].z = '"$"#,##0.00'; // Set the currency format
        delete wsPo[cellRef].w;         // Clear old formatted text to force refresh
      }
    }
    XLSX.utils.book_append_sheet(wb, wsPo, 'POs');

    const wsLines = XLSX.utils.json_to_sheet(lineRows);
    wsLines['!cols'] = [
      { wch: 28 }, { wch: 22 }, { wch: 8 }, { wch: 16 }, { wch: 18 }, { wch: 14 },
      { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 32 },
      { wch: 40 }, { wch: 28 },
    ];
    var colIndexJ = XLSX.utils.decode_col("J"); // Target column B (0-indexed as 1)
    var colIndexK= XLSX.utils.decode_col("K"); // Target column B (0-indexed as 1)
    var range = XLSX.utils.decode_range(wsLines['!ref']!);

    for (var i = range.s.r + 1; i <= range.e.r; ++i) { // Start at s.r + 1 to skip header
      var cellRefJ = XLSX.utils.encode_cell({ r: i, c: colIndexJ });
      var cellRefK = XLSX.utils.encode_cell({ r: i, c: colIndexK });
      if (!wsLines[cellRefJ]) continue;
      if (!wsLines[cellRefK]) continue;
      
      // Ensure the cell is treated as a number ('n')
      if (wsLines[cellRefJ].t === 'n') {
        wsLines[cellRefJ].z = '"$"#,##0.00'; // Set the currency format
        delete wsLines[cellRefJ].w;         // Clear old formatted text to force refresh
      }
      if (wsLines[cellRefK].t === 'n') {
        wsLines[cellRefK].z = '"$"#,##0.00'; // Set the currency format
        delete wsLines[cellRefK].w;         // Clear old formatted text to force refresh
      }
    }
    XLSX.utils.book_append_sheet(wb, wsLines, 'Line Items');

    XLSX.writeFile(wb, `purchase_orders_export_${date}.xlsx`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h1 className="text-3xl font-bold text-gray-100">All Purchase Orders</h1>
        <Button
          variant="outline"
          onClick={exportFilteredToExcel}
          disabled={filteredPOs.length === 0}
        >
          <Download className="h-4 w-4 mr-2" />
          Export to Excel
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search POs, line items, mechanical/electrical, consumable/part…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-gray-100 placeholder-gray-400"
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="sm:w-48">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-gray-100"
              >
                <option value="all" className="text-gray-100 bg-gray-700">All Statuses</option>
                <option value="draft" className="text-gray-100 bg-gray-700">Draft</option>
                <option value="pending_approval" className="text-gray-100 bg-gray-700">Pending Approval</option>
                <option value="approved" className="text-gray-100 bg-gray-700">Approved</option>
                <option value="declined" className="text-gray-100 bg-gray-700">Declined</option>
                <option value="pending_purchase" className="text-gray-100 bg-gray-700">Pending Purchase</option>
                <option value="purchased" className="text-gray-100 bg-gray-700">Purchased</option>
              </select>
            </div>
            <div className="sm:w-48">
              <select
                value={subOrgFilter}
                onChange={(e) => setSubOrgFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-gray-100"
              >
                <option value="all" className="text-gray-100 bg-gray-700">All Organizations</option>
                {subOrgs.map(org => (
                  <option key={org.id} value={org.id} className="text-gray-100 bg-gray-700">
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:w-48">
              <select
                value={teamSubcategoryFilter}
                onChange={(e) => setTeamSubcategoryFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-gray-100"
                title="Filter POs that include at least one line in this team subcategory"
              >
                <option value="all" className="text-gray-100 bg-gray-700">All team subcategories</option>
                <option value="mechanical" className="text-gray-100 bg-gray-700">Mechanical</option>
                <option value="electrical" className="text-gray-100 bg-gray-700">Electrical</option>
              </select>
            </div>
            <div className="sm:w-48">
              <select
                value={itemCategoryFilter}
                onChange={(e) => setItemCategoryFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-gray-100"
                title="Filter POs that include at least one line of this type"
              >
                <option value="all" className="text-gray-100 bg-gray-700">All line types</option>
                <option value="consumable" className="text-gray-100 bg-gray-700">Consumable</option>
                <option value="part" className="text-gray-100 bg-gray-700">Part</option>
                <option value="miscellaneous" className="text-gray-100 bg-gray-700">Miscellaneous</option>
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* Results */}
      <div className="text-sm text-gray-400 mb-4">
        Showing {filteredPOs.length} of {pos.length} purchase orders
        {statusFilter !== 'all' && ` (status: ${statusFilter.replace('_', ' ')})`}
        {subOrgFilter !== 'all' && ` (organization: ${subOrgs.find(org => org.id === subOrgFilter)?.name}${subOrgFilter !== 'all' ? ' - includes multi-org POs' : ''})`}
        {teamSubcategoryFilter !== 'all' && ` (team subcategory: ${teamSubcategoryFilter})`}
        {itemCategoryFilter !== 'all' && ` (line type: ${itemCategoryFilter})`}
        {searchTerm && ` (search: "${searchTerm}")`}
      </div>

      {filteredPOs.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">No purchase orders found</p>
            <p className="text-gray-500 mt-2">Try adjusting your filters</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-8">
          {groupedPOs.map(({ status, label, pos: statusPOs, count }) => (
            <div key={status} className="space-y-4">
              {/* Category Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <h2 className="text-xl font-semibold text-gray-100">{label}</h2>
                  <Badge variant="info" size="md">
                    {count} PO{count !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <div className="text-sm text-gray-400">
                  Sorted by newest first
                </div>
              </div>

              {/* POs in this category */}
              <div className="space-y-4">
                {statusPOs.map((po) => (
                  <Card key={po.id}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-100">
                            {po.name || `PO #${po.id.slice(-6).toUpperCase()}`}
                          </h3>
                          {getStatusBadge(po.status)}
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-gray-300 mb-3">
                          <div>
                            <span className="font-medium text-gray-200">Creator:</span> {po.creatorName}
                          </div>
                          <div>
                            <span className="font-medium text-gray-200">Sub-Organization:</span> 
                            {po.organizations && po.organizations.length > 1 ? (
                              <div className="inline-flex items-center ml-1">
                                <Badge variant="info" size="sm">
                                  {po.organizations.length} Organizations
                                </Badge>
                              </div>
                            ) : (
                              <span className="ml-1">{po.subOrgName}</span>
                            )}
                          </div>
                          <div>
                            <span className="font-medium text-gray-200">Total Amount:</span> ${po.totalAmount.toFixed(2)}
                          </div>
                          <div>
                            <span className="font-medium text-gray-200">
                              {po.status === 'draft' ? 'Last Updated:' : 'Created:'}
                            </span>{' '}
                            {po.status === 'draft'
                              ? formatPoDay(po.updatedAt || po.createdAt)
                              : formatPoDay(po.createdAt)}
                          </div>
                        </div>

                        <div className="text-sm text-gray-300">
                          <span className="font-medium text-gray-200">Items:</span> {po.lineItems.length} line item{po.lineItems.length !== 1 ? 's' : ''}
                          {po.lineItems.slice(0, 2).map((item, index) => (
                            <span key={index} className="ml-2">
                              • {item.itemName} ({item.quantity}x,{' '}
                              {formatTeamSubcategory(item.teamSubcategory)},{' '}
                              {formatItemCategory(item.itemCategory)})
                              {item.sku && ` [${item.sku}]`}
                            </span>
                          ))}
                          {po.lineItems.length > 2 && (
                            <span className="ml-2 text-gray-400">
                              +{po.lineItems.length - 2} more
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex space-x-2 ml-4">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleViewDetails(po)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View Details
                        </Button>
                        <Button 
                          variant="danger" 
                          size="sm"
                          onClick={() => handleDeletePO(po.id, po.name || `PO #${po.id.slice(-6).toUpperCase()}`)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PO Details Modal */}
      {selectedPO && (
        <PODetailsModal
          po={selectedPO}
          isOpen={isModalOpen}
          onClose={closeModal}
          onPOUpdated={handlePOUpdated}
        />
      )}

      {/* Custom Modals */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={closeConfirm}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.options.title}
        message={confirmModal.options.message}
        confirmText={confirmModal.options.confirmText}
        cancelText={confirmModal.options.cancelText}
        variant={confirmModal.options.variant}
        loading={confirmModal.loading}
      />

      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={closeAlert}
        title={alertModal.options.title}
        message={alertModal.options.message}
        variant={alertModal.options.variant}
      />
    </div>
  );
};