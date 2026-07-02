jQuery(function($) {

    // --- Placeholder Clipboard Copy (SMS tab + Abandoned Cart tab) - must run on all tabs ---
    $(document).on('click', '.otm-placeholder-tag', function(e) {
        e.preventDefault();
        var textToCopy = $(this).attr('data-clipboard-text') || $(this).data('clipboardText') || '';
        var $wrapper = $(this).closest('.otm-placeholders-wrapper');
        var feedback = $wrapper.length ? $wrapper.find('.otm-placeholder-copy-feedback') : $('#otm-placeholder-copy-feedback');
        function showCopied() {
            if (feedback.length) {
                feedback.stop(true, true).css('display', 'inline').fadeIn(200).delay(1000).fadeOut(400);
            }
        }
        if (!textToCopy) return;
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(textToCopy).then(showCopied, function() {
                var $ta = $('<textarea>').css({ position: 'fixed', left: '-9999px', top: 0 }).val(textToCopy).appendTo('body');
                $ta[0].select();
                try {
                    if (document.execCommand('copy')) showCopied();
                } catch (err) {}
                $ta.remove();
            });
        } else {
            var $ta = $('<textarea>').css({ position: 'fixed', left: '-9999px', top: 0 }).val(textToCopy).appendTo('body');
            $ta[0].select();
            try {
                if (document.execCommand('copy')) showCopied();
            } catch (err) {}
            $ta.remove();
        }
    });

    // ================== COURIER SETTINGS ================== //
    $('#otm_courier_enabled').on('change', function() {
        $('#otm-courier-credentials-wrapper').toggle($(this).is(':checked'));
    });

    $('#otm_common_note_enabled').on('change', function() {
        if ($(this).is(':checked')) {
            $('#otm_per_order_note_enabled').prop('checked', false);
        }
        $('#otm_common_note').toggle($(this).is(':checked'));
    });

    $('#otm_per_order_note_enabled').on('change', function() {
        if ($(this).is(':checked')) {
            $('#otm_common_note_enabled').prop('checked', false);
            $('#otm_common_note').hide();
        }
    });

    
    // ================== TAB MANAGER ================== //
    const colorPalette = [
        // Grays and Blacks
        '#000000', '#795548', '#607d8b', '#9e9e9e', '#b0bec5', '#cfd8dc', '#eceff1', '#FFFFFF',
        // Reds
        '#f44336', '#e91e63', '#fce4ec',
        // Purples
        '#9c27b0', '#673ab7', '#f3e5f5',
        // Blues
        '#3f51b5', '#2196f3', '#0d6efd', '#03a9f4', '#e7f1ff', '#a9c7ff', '#e8eaf6',
        // Teals/Cyans
        '#00bcd4', '#009688', '#e0f2f1',
        // Greens
        '#4caf50', '#8bc34a', '#e8f5e9',
        // Yellows/Oranges
        '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722', '#fff3e0', '#fffde7'
    ];

    var modal = jQuery('#otm-color-picker-modal');
    var modalSwatches = modal.find('.otm-color-swatches');
    var modalPreview = modal.find('.otm-color-preview');
    var modalHexInput = modal.find('.otm-hex-input');

    jQuery('.otm-color-picker-trigger').on('click', function() {
        var targetId = jQuery(this).data('target');
        var currentColor = jQuery('#' + targetId).val();

        modal.data('target', targetId);
        modalSwatches.empty();

        colorPalette.forEach(color => {
            const swatch = jQuery('<div class="otm-color-swatch"></div>').css('background-color', color).data('color', color);
            if (color.toLowerCase() === currentColor.toLowerCase()) {
                swatch.addClass('selected');
            }
            modalSwatches.append(swatch);
        });

        modalPreview.css('background-color', currentColor);
        modalHexInput.val(currentColor);

        modal.show();
    });

    modalSwatches.on('click', '.otm-color-swatch', function() {
        var color = jQuery(this).data('color');
        var targetId = modal.data('target');

        jQuery('#' + targetId).val(color);
        jQuery('.otm-color-picker-trigger[data-target="' + targetId + '"] .otm-color-preview').css('background-color', color);
        modalPreview.css('background-color', color);
        modalHexInput.val(color);

        modalSwatches.find('.selected').removeClass('selected');
        jQuery(this).addClass('selected');
    });

    modalHexInput.on('input', function() {
        var color = jQuery(this).val();
        var targetId = modal.data('target');

        if (/^#[0-9A-F]{6}$/i.test(color) || /^#[0-9A-F]{3}$/i.test(color)) {
            jQuery('#' + targetId).val(color);
            jQuery('.otm-color-picker-trigger[data-target="' + targetId + '"] .otm-color-preview').css('background-color', color);
            modalPreview.css('background-color', color);

            modalSwatches.find('.selected').removeClass('selected');
            modalSwatches.find('.otm-color-swatch').each(function() {
                if (jQuery(this).data('color').toLowerCase() === color.toLowerCase()) {
                    jQuery(this).addClass('selected');
                }
            });
        }
    });

    jQuery('.otm-modal-close, #otm-modal-done, .otm-modal-overlay').on('click', function(e) {
        if (e.target === this) {
            modal.hide();
        }
    });

    jQuery(document).on('click', '.otm-appearance-group-head', function(e) {
        if (jQuery(e.target).closest('.otm-appearance-group-reset').length) {
            return;
        }
        jQuery(this).closest('.otm-appearance-group').toggleClass('otm-appearance-group-collapsed');
        jQuery(this).attr('aria-expanded', jQuery(this).closest('.otm-appearance-group').hasClass('otm-appearance-group-collapsed') ? 'false' : 'true');
    });

    jQuery(document).on('click', '.otm-appearance-group-reset', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var group = jQuery(this).closest('.otm-appearance-group');
        group.find('input[id^="otm_appearance_"]').each(function() {
            var input = jQuery(this);
            var def = input.data('default') || '#ffffff';
            input.val('');
            var targetId = input.attr('id');
            group.find('.otm-color-picker-trigger[data-target="' + targetId + '"] .otm-color-preview').css('background-color', def);
        });
    });

    jQuery('#otm-save-manager').on('click', function() {
        var button = jQuery(this);
        var originalText = button.text();
        button.text('Saving...').prop('disabled', true);

        var tabs = [];
        jQuery('#otm-sortable-tabs li').each(function() {
            var li = jQuery(this);
            if (li.find('.otm-item-checkbox').is(':checked')) {
                tabs.push({
                    key: li.data('key'),
                    label: li.find('.otm-item-label').text()
                });
            }
        });

        var columns = [];
        var profitLossOnlyKeys = (typeof otm_admin_params !== 'undefined' && otm_admin_params.profit_loss_only_column_keys) ? otm_admin_params.profit_loss_only_column_keys : [];
        var suffixes = [' (Profit/Loss mode only)', ' (Profit/Loss only)', ' (P/L)'];
        jQuery('#otm-sortable-columns li').each(function() {
            var li = jQuery(this);
            if (li.find('.otm-item-checkbox').is(':checked')) {
                var key = li.data('key');
                var labelSpan = li.find('.otm-item-label');
                var labelTextSpan = labelSpan.find('.column-label-text');
                // For profit/loss columns, get only the base text; for others, get full text
                var label = labelTextSpan.length ? labelTextSpan.text().trim() : labelSpan.text().trim();
                if (profitLossOnlyKeys.indexOf(key) !== -1) {
                    // Strip any remaining suffixes (fallback)
                    suffixes.forEach(function(s) {
                        while (label.indexOf(s) !== -1) {
                            label = label.replace(s, '').trim();
                        }
                    });
                }
                columns.push({ key: key, label: label });
            }
        });

        var appearance = {};
        jQuery('[id^="otm_appearance_"]').each(function() {
            var id = jQuery(this).attr('id');
            if (id && id.indexOf('otm_appearance_') === 0) {
                var key = id.replace('otm_appearance_', '');
                appearance[key] = jQuery(this).val() || '';
            }
        });

        jQuery.post(ajaxurl, {
            action: 'otm_save_manager_tab',
            tabs: tabs,
            columns: columns,
            appearance: appearance,
            nonce: otm_admin_params.nonces.save_manager_tab
        }, function(response) {
            if (response.success) {
                if (typeof WOTM_APP !== 'undefined' && typeof WOTM_APP.showToast === 'function') {
                    WOTM_APP.showToast('Manager settings saved.');
                } else {
                    alert('Manager settings saved.');
                }
            } else {
                alert('Error saving settings.');
            }
        }).always(function() {
            button.text(originalText).prop('disabled', false);
        });
    });

    // AJAX search for blocked numbers
    var searchTimeout;
    $('#otm-blocked-number-search').on('keyup', function() {
        clearTimeout(searchTimeout);
        var searchTerm = $(this).val();
        var tableBody = $('#otm-blocked-numbers-table tbody');

        searchTimeout = setTimeout(function() {
            tableBody.html('<tr><td colspan="8" style="text-align:center;">Searching...</td></tr>');
            
            $.post(ajaxurl, {
                action: 'otm_search_blocklist',
                search_term: searchTerm,
                nonce: otm_admin_params.nonces.blocker_search
            }, function(response) {
                if (response.success) {
                    tableBody.html(response.data.html);
                } else {
                    tableBody.html('<tr><td colspan="8" style="text-align:center; color:red;">' + response.data.html + '</td></tr>');
                }
            }).fail(function() {
                tableBody.html('<tr><td colspan="8" style="text-align:center; color:red;">An AJAX error occurred.</td></tr>');
            });
        }, 500); // 500ms debounce
    });




    // "Select All" for blocked numbers
    jQuery('#otm-select-all-blocked').on('click', function() {
        var isChecked = jQuery(this).prop('checked');
        jQuery('.otm-blocked-number-checkbox').prop('checked', isChecked);
    });

    // Apply bulk action
    jQuery('#otm-apply-bulk-action').on('click', function() {
        var action = jQuery('#otm-blocked-bulk-action').val();
        if (!action) {
            alert('Please select a bulk action.');
            return;
        }

        var selectedIndexes = [];
        jQuery('.otm-blocked-number-checkbox:checked').each(function() {
            selectedIndexes.push(jQuery(this).val());
        });

        if (selectedIndexes.length === 0) {
            alert('Please select at least one number.');
            return;
        }

        if (action === 'delete') {
            if (!confirm('Are you sure you want to delete the selected numbers from the blocklist?')) {
                return;
            }

            jQuery.post(ajaxurl, {
                action: 'otm_bulk_unblock_numbers',
                ids: selectedIndexes,
                nonce: otm_admin_params.nonces.bulk_unblock
            }, function(response) {
                if (response.success) {
                    alert('Selected numbers have been unblocked.');
                    location.reload(); // Reload the page to see the changes
                } else {
                    alert('Error unblocking numbers.');
                }
            });
        }
    });

    // Dynamic placeholder for "Add New Blocked Entry"
    jQuery('#otm-block-type').on('change', function() {
        var selectedType = jQuery(this).val();
        var placeholderText = 'Value to block';
        var inputType = 'text';

        if (selectedType === 'phone') {
            placeholderText = 'Provide the phone number';
            inputType = 'tel';
        } else if (selectedType === 'email') {
            placeholderText = 'Provide the email address';
            inputType = 'email';
        } else if (selectedType === 'ip') {
            placeholderText = 'Provide the IP address';
        }
        jQuery('#otm-block-value').attr('placeholder', placeholderText).attr('type', inputType);
    }).trigger('change');

    // Handle Unblock button
    $(document).on('click', '.otm-unblock-item-btn', function() {
        if (!confirm('Are you sure you want to unblock this entry?')) {
            return;
        }
        var button = $(this);
        var id = button.data('id');
        $.post(ajaxurl, {
            action: 'otm_unblock_item',
            id: id,
            nonce: otm_admin_params.nonces.bulk_unblock
        }, function(response) {
            if (response.success) {
                button.closest('tr').fadeOut(300, function() { $(this).remove(); });
            } else {
                alert('Error: ' + response.data);
            }
        });
    });

    // Handle Edit Duration button
    $(document).on('click', '.otm-edit-block-duration', function() {
        var button = $(this);
        var id = button.data('id');
        var durationCell = button.closest('tr').find('.otm-block-duration');
        var currentDurationText = durationCell.text();
        var currentDuration = currentDurationText.includes('Permanent') ? '' : parseInt(currentDurationText, 10);

        durationCell.html('<input type="number" class="otm-duration-input" value="' + currentDuration + '" style="width: 80px;"> <button class="button button-primary otm-save-duration" data-id="' + id + '">Save</button>');
        button.hide();
    });

    // Handle Save Duration button
    $(document).on('click', '.otm-save-duration', function() {
        var button = $(this);
        var id = button.data('id');
        var durationCell = button.closest('td');
        var newDuration = durationCell.find('.otm-duration-input').val();

        $.post(ajaxurl, {
            action: 'otm_edit_blocked_duration',
            id: id,
            duration: newDuration,
            nonce: otm_admin_params.nonces.edit_blocked_duration
        }, function(response) {
            if (response.success) {
                durationCell.html(response.data.new_duration_text);
                durationCell.closest('tr').find('.otm-edit-block-duration').show();
            } else {
                alert('Error: ' + response.data);
            }
        });
    });

    jQuery('#otm-add-blocked-entry').on('click', function(e) {
        e.preventDefault();

        var form = jQuery('#otm-add-blocked-entry-form');
        var formData = form.serialize();

        jQuery.post(ajaxurl, {
            action: 'otm_add_blocked_entry_ajax',
            nonce: otm_admin_params.nonces.add_blocked_entry_ajax,
            data: formData
        }, function(response) {
            if (response.success) {
                alert('Entry added to the blocklist!');
                location.reload();
            } else {
                alert('Error: ' + response.data.message);
            }
        });
    });


    $('#otm-sortable-tabs').sortable({ handle: '.drag-handle' });

    $('#otm-select-all-tabs-chk').on('change', function() {
        const isChecked = $(this).is(':checked');
        $('#otm-sortable-tabs .otm-item-checkbox').prop('checked', isChecked);
    });




    // Custom Status Creator
    $('#otm-create-custom-status').on('click', function() {
        const newStatusLabel = $('#otm-new-custom-status-label').val().trim();
        if (!newStatusLabel) {
            alert('Please enter a label for the new status.');
            return;
        }

        $('#otm-custom-status-spinner').addClass('is-active');

        $.post(ajaxurl, {
            action: 'otm_create_custom_status',
            label: newStatusLabel,
            nonce: otm_admin_params.nonces.create_custom_status
        }, function(response) {
            $('#otm-custom-status-spinner').removeClass('is-active');
            if (response.success) {
                alert('Custom status created successfully. Please reload the page.');
                location.reload();
            } else {
                alert('Error: ' + response.data);
            }
        });
    });

    // Edit Custom Status
    $('#otm-custom-status-list').on('click', '.otm-edit-custom-status', function() {
        const item = $(this).closest('.otm-custom-status-item');
        const labelSpan = item.find('.otm-custom-status-label');
        const currentLabel = labelSpan.text();
        const newLabel = prompt('Enter the new label for this status:', currentLabel);

        if (newLabel && newLabel.trim() !== '' && newLabel.trim() !== currentLabel) {
            const slug = item.data('slug');
            $.post(ajaxurl, {
                action: 'otm_edit_custom_status',
                slug: slug,
                label: newLabel.trim(),
                nonce: otm_admin_params.nonces.edit_custom_status
            }, function(response) {
                if (response.success) {
                    alert('Status updated successfully. Please reload the page.');
                    location.reload();
                } else {
                    alert('Error: ' + response.data);
                }
            });
        }
    });

    // Delete Custom Status
    $('#otm-custom-status-list').on('click', '.otm-delete-custom-status', function() {
        if (!confirm('Are you sure you want to delete this custom status? This action cannot be undone.')) {
            return;
        }

        const item = $(this).closest('.otm-custom-status-item');
        const slug = item.data('slug');

        $.post(ajaxurl, {
            action: 'otm_delete_custom_status',
            slug: slug,
            nonce: otm_admin_params.nonces.delete_custom_status
        }, function(response) {
            if (response.success) {
                alert('Status deleted successfully. Please reload the page.');
                location.reload();
            } else {
                alert('Error: ' + response.data);
            }
        });
    });

    // ================== COLUMN MANAGER ================== //
    $('#otm-sortable-columns').sortable({ handle: '.drag-handle' });

    $('#otm-select-all-columns-chk').on('change', function() {
        const isChecked = $(this).is(':checked');
        $('#otm-sortable-columns .otm-item-checkbox').prop('checked', isChecked);
    });

    $('#otm-sortable-columns').on('click', '.edit-column-icon', function() {
        var li = $(this).closest('li');
        var labelSpan = li.find('.column-label');
        var labelTextSpan = labelSpan.find('.column-label-text');
        var profitLossBadge = labelSpan.find('.otm-profit-loss-badge');
        var hasProfitLossBadge = profitLossBadge.length > 0;
        var badgeHtml = hasProfitLossBadge ? profitLossBadge[0].outerHTML : '';
        var titleAttr = labelSpan.attr('title') || '';
        
        // Get only the base label text (without the badge)
        var currentText = labelTextSpan.length ? labelTextSpan.text() : labelSpan.text().replace(/\s*\(P\/L\)\s*$/, '').trim();
        var input = $('<input type="text" class="otm-edit-input" />');
        input.val(currentText);
        
        // Replace the entire label span with input
        labelSpan.replaceWith(input);
        input.focus();

        input.on('blur', function() {
            var newText = $(this).val().trim();
            if (!newText) {
                newText = currentText; // Restore if empty
            }
            var newLabelSpan = $('<span class="otm-item-label column-label"></span>');
            if (titleAttr) {
                newLabelSpan.attr('title', titleAttr);
            }
            newLabelSpan.html('<span class="column-label-text">' + newText + '</span>');
            if (hasProfitLossBadge) {
                newLabelSpan.append(' ' + badgeHtml);
            }
            $(this).replaceWith(newLabelSpan);
        });

        input.on('keypress', function(e) {
            if (e.which === 13) {
                $(this).blur();
            }
        });
    });


    jQuery('#otm-reset-plugin').on('click', function() {
        if (!confirm('Reset all Easy Order Manager settings to default? This cannot be undone.')) {
            return;
        }
        var btn = jQuery(this).prop('disabled', true);
        jQuery.post(ajaxurl, {
            action: 'otm_reset_plugin',
            nonce: otm_admin_params.nonces.reset_plugin
        }, function(response) {
            btn.prop('disabled', false);
            if (response.success) {
                alert('Plugin has been reset to default.');
                location.reload();
            } else {
                alert('Error resetting plugin.');
            }
        });
    });

    $('#otm-recreate-page').on('click', function() {
        const button = $(this);
        const spinner = $('#otm-recreate-page-spinner');
        const message = $('#otm-recreate-page-message');

        button.prop('disabled', true);
        spinner.addClass('is-active');
        message.text('');

        $.post(ajaxurl, {
            action: 'otm_recreate_page',
            nonce: otm_admin_params.nonces.recreate_page
        }, function(response) {
            spinner.removeClass('is-active');
            button.prop('disabled', false);
            if (response.success) {
                message.css('color', 'green').html(response.data);
            } else {
                message.css('color', 'red').html('Error: ' + response.data);
            }
        });
    });

    $('#otm-activate-license').on('click', function(e) {
        e.preventDefault();
        const button = $(this);
        const spinner = $('#otm-license-spinner');
        const messageDiv = $('#otm-license-message');
        const licenseKey = $('#otm_license_key').val();

        button.prop('disabled', true);
        spinner.addClass('is-active');
        messageDiv.text('');

        $.post(ajaxurl, {
            action: 'otm_activate_license',
            license_key: licenseKey,
            nonce: otm_admin_params.nonces.license
        }, function(response) {
            spinner.removeClass('is-active');
            button.prop('disabled', false);
            if (response.success) {
                messageDiv.css('color', 'green').html(response.data.message);
                if (response.data.order_credits_balance !== undefined) {
                    var oCredits = parseFloat(response.data.order_credits_balance);
                    $('#otm-order-credits-value').text(oCredits > 50000 ? 'Unlimited' : oCredits.toFixed(2));
                }
                setTimeout(function() { location.reload(); }, 1000);
            } else {
                messageDiv.css('color', 'red').html('Error: ' + response.data.message);
            }
        });
    });

    $(document).on('click', '#otm-save-bdcourier-key', function(e) {
        e.preventDefault();
        const button = $(this);
        const spinner = $('#otm-bdcourier-spinner');
        const messageDiv = $('#otm-bdcourier-message');
        const apiKey = $('#otm_bdcourier_api_key').val();

        button.prop('disabled', true);
        spinner.addClass('is-active');
        messageDiv.text('');

        $.post(ajaxurl, {
            action: 'otm_save_bdcourier_api_key',
            api_key: apiKey,
            nonce: otm_admin_params.nonces.bdcourier_key
        }, function(response) {
            spinner.removeClass('is-active');
            button.prop('disabled', false);
            if (response.success) {
                messageDiv.css('color', 'green').text(response.data);
            } else {
                messageDiv.css('color', 'red').text('Error: ' + response.data);
            }
        });
    });

    // Save Blocker Settings via AJAX
    $(document).on('click', '#otm-save-blocker-settings', function() {
        var button = $(this);
        var originalText = button.text();
        button.text('Saving...').prop('disabled', true);

        $.post(ajaxurl, {
            action: 'otm_save_blocker_settings_ajax',
            nonce: otm_admin_params.nonces.save_blocker_settings,
            enable_duplicate_protection: $('#otm-blocker-settings-form input[name="enable_duplicate_protection"]').is(':checked') ? 'yes' : 'no',
            duplicate_time_limit: $('#otm-blocker-settings-form input[name="duplicate_time_limit"]').val(),
            duplicate_custom_message: $('#otm-blocker-settings-form textarea[name="duplicate_custom_message"]').val(),
            block_message: $('#otm-blocker-settings-form textarea[name="block_message"]').val()
        }, function(response) {
            if (response.success) {
                if (typeof WOTM_APP !== 'undefined' && typeof WOTM_APP.showToast === 'function') {
                    WOTM_APP.showToast(response.data.message || 'Settings saved.');
                } else {
                    alert(response.data.message || 'Settings saved.');
                }
            } else {
                alert('Error: ' + (response.data || 'Could not save settings.'));
            }
        }).fail(function() {
            alert('An AJAX error occurred. Please try again.');
        }).always(function() {
            button.text(originalText).prop('disabled', false);
        });
    });

    // Modal logic for Order Blocker
    $('#otm-open-add-blocked-modal').on('click', function() {
        $('#otm-add-blocked-modal').show();
    });

    $('#otm-close-add-blocked-modal, #otm-add-blocked-modal').on('click', function(e) {
        if (e.target === this) {
            $('#otm-add-blocked-modal').hide();
        }
    });

    $('#otm-add-blocked-modal .otm-modal-content').on('click', function(e) {
        e.stopPropagation();
    });

    $('#otm-create-user-btn').on('click', function() {
        const username = $('#otm-new-username').val();
        const email = $('#otm-new-email').val();
        const password = $('#otm-new-password').val();
        const role = $('#otm-new-user-role').val();

        if (!username || !email || !password) {
            alert('Username, Email, and Password are required.');
            return;
        }

        $(this).prop('disabled', true);

        $.post(ajaxurl, {
            action: 'otm_create_and_add_user',
            username: username,
            email: email,
            password: password,
            role: role,
            nonce: otm_admin_params.nonces.user_management
        }, function(response) {
            if (response.success) {
                alert('User created and added successfully.');
                location.reload();
            } else {
                alert('Error: ' + response.data);
                $('#otm-create-user-btn').prop('disabled', false);
            }
        });
    });



    // The following JavaScript block should be removed. It's a duplicate of what is now in courier-settings.php

// AJAX handler for saving invoice settings
    $('#otm-save-invoice-settings').on('click', function(e) {
        e.preventDefault();
        var button = $(this);
        var originalText = button.text();
        button.text('Saving...').prop('disabled', true);

        var logoUrl             = $('#otm_invoice_logo_url').val();
        var merchantPhone       = $('#otm_invoice_merchant_phone').val();
        var extraColumns        = $('#otm_invoice_extra_columns').val();
        var extraColumnsLayout  = $('#otm_invoice_extra_columns_layout').val();

        $.post(ajaxurl, {
            action: 'otm_save_invoice_settings',
            nonce: otm_admin_params.nonces.save_invoice_settings,
            logo_url: logoUrl,
            merchant_phone: merchantPhone,
            extra_columns: extraColumns,
            extra_columns_layout: extraColumnsLayout
        }, function(response) {
            if (response.success) {
                alert('Invoice settings saved successfully!');
            } else {
                alert('Error saving invoice settings: ' + response.data);
            }
        }).fail(function() {
            alert('An AJAX error occurred. Please try again.');
        }).always(function() {
            button.text(originalText).prop('disabled', false);
        });
    });

    // Media uploader for invoice logo
    var mediaUploader;
    $('#otm-upload-invoice-logo-button').on('click', function(e) {
        e.preventDefault();
        if (mediaUploader) {
            mediaUploader.open();
            return;
        }
        mediaUploader = wp.media.frames.file_frame = wp.media({
            title: 'Choose Invoice Logo',
            button: {
                text: 'Choose Logo'
            },
            multiple: false
        });

        mediaUploader.on('select', function() {
            var attachment = mediaUploader.state().get('selection').first().toJSON();
            $('#otm_invoice_logo_url').val(attachment.url);
            $('#otm-invoice-logo-preview').attr('src', attachment.url).show();
            $('#otm-remove-invoice-logo-button').show();
        });

        mediaUploader.open();
    });

    $('#otm-remove-invoice-logo-button').on('click', function() {
        $('#otm_invoice_logo_url').val('');
        $('#otm-invoice-logo-preview').attr('src', '').hide();
        $(this).hide();
    });

    // --- Extra Invoice Columns Modal ---
    (function () {
        var $modal = $('#otm-extra-cols-modal');

        function openModal() {
            // Sync checkbox states from the current hidden-input value.
            var current = [];
            try { current = JSON.parse($('#otm_invoice_extra_columns').val() || '[]'); } catch (e) {}
            $modal.find('.otm-extra-col-chk').each(function () {
                $(this).prop('checked', current.indexOf($(this).val()) !== -1);
            });
            // Sync layout radio.
            var layout = $('#otm_invoice_extra_columns_layout').val() || 'multiline';
            $modal.find('input[name="otm_extra_cols_layout_radio"][value="' + layout + '"]').prop('checked', true);
            $modal.show();
        }

        function closeModal() {
            $modal.hide();
        }

        function updateSummary(keys, labels) {
            var $summaryText = $('#otm-extra-cols-summary-text');
            var $btn         = $('#otm-configure-extra-cols-btn');
            if (keys.length === 0) {
                $summaryText.html('<em style="color:#666;">No extra fields selected</em>');
                $btn.text('Configure');
            } else {
                var visible  = labels.slice(0, 3);
                var more     = labels.length - 3;
                var safeText = $('<span>').text(visible.join(', ')).html();
                if (more > 0) {
                    safeText += ' <span style="color:#999;">(+' + more + ' more)</span>';
                }
                $summaryText.html(safeText);
                $btn.text('Edit');
            }
        }

        $('#otm-configure-extra-cols-btn').on('click', function (e) {
            e.preventDefault();
            openModal();
        });

        $('#otm-extra-cols-modal-close, #otm-extra-cols-modal-cancel').on('click', function () {
            closeModal();
        });

        // Close on backdrop click.
        $modal.on('click', function (e) {
            if ($(e.target).is($modal)) {
                closeModal();
            }
        });

        $('#otm-extra-cols-modal-save').on('click', function () {
            var selectedKeys   = [];
            var selectedLabels = [];
            $modal.find('.otm-extra-col-chk:checked').each(function () {
                selectedKeys.push($(this).val());
                selectedLabels.push($(this).closest('label').find('span').text().trim());
            });
            var layout = $modal.find('input[name="otm_extra_cols_layout_radio"]:checked').val() || 'multiline';

            $('#otm_invoice_extra_columns').val(JSON.stringify(selectedKeys));
            $('#otm_invoice_extra_columns_layout').val(layout);
            updateSummary(selectedKeys, selectedLabels);
            closeModal();
        });
    }());

    // --- Character and SMS Part Counter (provider rules) - shared by SMS tab and Abandoned Cart tab ---
    // GSM 7bit: 160 single / 153 per segment. GSM extended (~^{}[]|\|) count as 2 chars.
    // Unicode (UCS-2): 70 single / 67 per segment. Emojis (surrogate pairs) count as 2 chars (UTF-16 code units).
    var gsmExtendedChars = new Set('~^{}[]\\|');
    function gsmBillingLength(str) {
        var len = 0, i;
        for (i = 0; i < str.length; i++) {
            len += gsmExtendedChars.has(str[i]) ? 2 : 1;
        }
        return len;
    }
    function updateSmsCounter(textarea) {
        var text = (textarea.val() || '');
        var hasUnicode = /[^\u0000-\u007F]/.test(text);
        var gsm7Limit = 160, gsm7MultipartLimit = 153;
        var unicodeLimit = 70, unicodeMultipartLimit = 67;
        var billingLength, smsParts;

        if (hasUnicode) {
            billingLength = text.length; // UTF-16 code units: emojis/surrogate pairs count as 2
            smsParts = billingLength <= 0 ? 1 : (billingLength <= unicodeLimit ? 1 : Math.ceil(billingLength / unicodeMultipartLimit));
        } else {
            billingLength = gsmBillingLength(text);
            smsParts = billingLength <= 0 ? 1 : (billingLength <= gsm7Limit ? 1 : Math.ceil(billingLength / gsm7MultipartLimit));
        }

        var counterDiv = textarea.next('.otm-sms-counter');
        if (counterDiv.length) {
            counterDiv.text('Characters: ' + billingLength + ' / SMS: ' + smsParts);
        }
    }
    $(document).on('input', '.otm-sms-template', function() {
        updateSmsCounter($(this));
    });

    // ================== NEW SMS SETTINGS TAB LOGIC (V2) ================== //
    if ($('#otm-sms-settings-form, #otm-customer-filter-settings-form').length) {
        var recommendedHighRateRules = [
            { min: 0, max: 1, min_ratio: 0 },
            { min: 2, max: 5, min_ratio: 50 },
            { min: 6, max: 15, min_ratio: 55 },
            { min: 16, max: '', min_ratio: 60 }
        ];

        // --- Tab Navigation ---
        $('.otm-tab-link').on('click', function(e) {
            e.preventDefault();
            var target = $(this).attr('href');

            // Update active link
            $('.otm-tab-link').removeClass('active');
            $(this).addClass('active');

            // Update active pane
            $('.otm-tab-pane').removeClass('active');
            $(target).addClass('active');
        });

        // --- (Legacy) Master Enable/Disable Switch (for main SMS functionality) ---
        function updateMasterSmsSwitch() {
            var $masterToggle = $('#otm-sms-enabled-main');
            var isEnabled = $masterToggle.length ? $masterToggle.is(':checked') : true;
            $('#otm-sms-settings-form').attr('data-master-enabled', isEnabled);
        }

        if ($('#otm-sms-enabled-main').length) {
            $('#otm-sms-enabled-main').on('change', updateMasterSmsSwitch);
        }

        function buildHighRateRuleRow(rule) {
            var safeRule = rule || { min: 0, max: '', min_ratio: 0 };
            var maxVal = (safeRule.max === null || typeof safeRule.max === 'undefined') ? '' : safeRule.max;
            return '' +
                '<tr class="otm-high-rate-rule-row">' +
                    '<td><input type="number" min="0" step="1" name="high_rate_gate_rules[min][]" value="' + (safeRule.min || 0) + '" /></td>' +
                    '<td><input type="number" min="0" step="1" name="high_rate_gate_rules[max][]" value="' + maxVal + '" /></td>' +
                    '<td><input type="number" min="0" max="100" step="0.01" name="high_rate_gate_rules[min_ratio][]" value="' + (safeRule.min_ratio || 0) + '" /></td>' +
                    '<td><button type="button" class="button otm-remove-high-rate-rule">Remove</button></td>' +
                '</tr>';
        }

        function getActiveSmsSettingsForm() {
            var $smsForm = $('#otm-sms-settings-form');
            if ($smsForm.length) {
                return $smsForm;
            }
            return $('#otm-customer-filter-settings-form');
        }

        function updateAdvanceValueInputConstraints() {
            var type = $('#high_rate_gate_low_rate_advance_type').val();
            var $valueInput = $('#high_rate_gate_low_rate_advance_value');
            if (!$valueInput.length) {
                return;
            }
            if (type === 'percentage') {
                $valueInput.attr('max', '100');
                var currentVal = parseFloat($valueInput.val() || 0);
                if (!isNaN(currentVal) && currentVal > 100) {
                    $valueInput.val('100');
                }
            } else {
                $valueInput.removeAttr('max');
            }
        }

        $(document).on('change', '#high_rate_gate_low_rate_advance_type', updateAdvanceValueInputConstraints);

        function updateLowRateModeDetailPanels() {
            var $mode = $('#high_rate_gate_low_rate_mode');
            var $adv = $('#otm-low-rate-detail-advance');
            var $blk = $('#otm-low-rate-detail-block');
            if (!$mode.length || !$adv.length || !$blk.length) {
                return;
            }
            var mode = $mode.val() || 'advance';
            if (mode === 'block_notice') {
                $adv.hide().find('input, select, textarea, button').prop('disabled', true);
                $blk.show().find('textarea, input, select, button').prop('disabled', false);
            } else {
                $blk.hide().find('textarea, input, select, button').prop('disabled', true);
                $adv.show().find('input, select, textarea, button').prop('disabled', false);
            }
        }

        $(document).on('change', '#high_rate_gate_low_rate_mode', updateLowRateModeDetailPanels);

        $(document).on('click', '#otm-add-high-rate-rule', function() {
            var tbody = $('#otm-high-rate-rules-table tbody');
            if (!tbody.length) {
                return;
            }
            tbody.append(buildHighRateRuleRow({ min: 0, max: '', min_ratio: 0 }));
        });

        $(document).on('click', '#otm-apply-high-rate-defaults', function() {
            var tbody = $('#otm-high-rate-rules-table tbody');
            if (!tbody.length) {
                return;
            }
            tbody.empty();
            recommendedHighRateRules.forEach(function(rule) {
                tbody.append(buildHighRateRuleRow(rule));
            });
        });

        $(document).on('click', '.otm-remove-high-rate-rule', function() {
            var tbody = $('#otm-high-rate-rules-table tbody');
            var rowCount = tbody.find('.otm-high-rate-rule-row').length;
            if (rowCount <= 1) {
                if (typeof WOTM_APP !== 'undefined' && typeof WOTM_APP.showToast === 'function') {
                    WOTM_APP.showToast('At least one rule is required.');
                } else {
                    alert('At least one rule is required.');
                }
                return;
            }
            $(this).closest('tr').remove();
        });

        // --- Individual Template Toggle Visibility and Admin Number Check ---
        function updateTemplateState(toggle, useAnimation) {
            var isChecked = $(toggle).is(':checked');
            var group = $(toggle).closest('.otm-template-group');
            var textarea = group.find('.otm-sms-template');
            var statusLabel = group.find(' > .otm-toggle-container > span');
            var isAdminTemplate = $(toggle).attr('name').includes('[admin_enabled]');
            var adminNumberField = $('#otm_admin_sms_number');
            var adminNumber = adminNumberField.val().trim();
            var adminTooltip = $('#otm-admin-number-tooltip');

            if (isAdminTemplate && isChecked && adminNumber === '') {
                // If trying to enable an admin template and no admin number is set
                $(toggle).prop('checked', false); // Keep it unchecked
                statusLabel.text('Disabled'); // Keep label as Disabled
                group.addClass('is-disabled'); // Ensure visual disabled state

                // Show tooltip
                adminTooltip.fadeIn(200).delay(3000).fadeOut(400);
                adminNumberField.focus(); // Focus on the admin number field
                return; // Stop further processing for this toggle
            }

            group.toggleClass('is-disabled', !isChecked);

            if (isChecked) {
                statusLabel.text('Enabled');
            } else {
                statusLabel.text('Disabled');
            }

            if (isChecked) {
                if (useAnimation) {
                    textarea.slideDown(200);
                } else {
                    textarea.show();
                }
            } else {
                if (useAnimation) {
                    textarea.slideUp(200);
                } else {
                    textarea.hide();
                }
            }
        }

        $('.otm-template-group .otm-toggle-switch input').on('change', function() {
            updateTemplateState(this, true); // Use animation on user interaction
        });

        // --- Save Settings AJAX ---
        $(document).on('click', '#otm-save-sms-settings, #otm-save-customer-filter-settings', function(e) {
            e.preventDefault();

            var button = $(this);
            var originalText = button.text();
            var form = getActiveSmsSettingsForm();
            if (!form.length) {
                return;
            }
            button.text('Saving...').prop('disabled', true);

            $.post(ajaxurl, {
                action: 'otm_save_sms_settings',
                nonce: otm_admin_params.nonces.sms_settings,
                form_data: form.serialize()
            }, function(response) {
                if (response.success) {
                    if (typeof WOTM_APP !== 'undefined' && typeof WOTM_APP.showToast === 'function') {
                        WOTM_APP.showToast('SMS settings saved successfully!');
                    } else {
                        alert('SMS settings saved successfully!');
                    }
                } else {
                    alert('Error: ' + (response.data || 'An unknown error occurred.'));
                }
            }).fail(function() {
                alert('An AJAX error occurred. Please check your connection and try again.');
            }).always(function() {
                button.text(originalText).prop('disabled', false);
            });
        });

        $(document).on('submit', '#otm-sms-settings-form, #otm-customer-filter-settings-form', function(e) {
            e.preventDefault();
            var $button = $(this).find('#otm-save-sms-settings, #otm-save-customer-filter-settings').first();
            if ($button.length) {
                $button.trigger('click');
            }
        });

        // --- Initial State on Page Load ---
        function initializeSmsSettingsUI() {
            updateMasterSmsSwitch();
            updateAdvanceValueInputConstraints();
            updateLowRateModeDetailPanels();
            $('.otm-sms-template').each(function() {
                updateSmsCounter($(this));
            });
            $('.otm-template-group .otm-toggle-switch input').each(function() {
                updateTemplateState(this, false); // No animation on page load
            });
        }

        initializeSmsSettingsUI();
    }

    // Abandoned Cart: SMS Reminder Settings only configurable when toggle is on (like SMS tab)
    function updateAbandonedCartSmsEnabled() {
        var $form = $('#otm-abandoned-cart-settings-form');
        var $toggle = $('#otm-abandoned-cart-sms-enabled');
        if ($form.length && $toggle.length) {
            $form.attr('data-sms-reminders-enabled', $toggle.is(':checked'));
        }
    }
    $(document).on('change', '#otm-abandoned-cart-sms-enabled', updateAbandonedCartSmsEnabled);
    if ($('#otm-abandoned-cart-settings-form').length) {
        updateAbandonedCartSmsEnabled();
        // Same SMS character/SMS part counter as SMS tab (provider rules)
        var $acTemplate = $('#otm_abandoned_cart_sms_template');
        if ($acTemplate.length) {
            updateSmsCounter($acTemplate);
        }
    }

    // Abandoned Cart settings save
    $(document).on('click', '#otm-save-abandoned-cart-settings', function() {
        var button = $(this);
        var originalText = button.text();
        button.prop('disabled', true).text('Saving...');
        $.post(ajaxurl, {
            action: 'otm_save_abandoned_cart_settings',
            nonce: otm_admin_params.nonces.abandoned_cart_settings,
            form_data: $('#otm-abandoned-cart-settings-form').serialize()
        }, function(response) {
            if (response.success) {
                alert('Abandoned cart settings saved.');
            } else {
                alert('Error: ' + (response.data || 'Could not save.'));
            }
        }).fail(function() {
            alert('An AJAX error occurred.');
        }).always(function() {
            button.text(originalText).prop('disabled', false);
        });
    });

    // Single "Check Balances" button: one request returns SMS, call, and order credits.
    $(document).on('click', '#otm-check-balances', function() {
        var $btn = $(this);
        var originalText = $btn.text();
        var $smsVal = $('#otm-sms-balance-value');
        var $callVal = $('#otm-call-balance-value');
        var $orderVal = $('#otm-order-credits-value');
        var oldSms = $smsVal.text();
        var oldCall = $callVal.length ? $callVal.text() : '--.--';
        var oldOrder = $orderVal.text();

        $btn.text('Checking...').prop('disabled', true);
        $smsVal.text('...');
        if ($callVal.length) $callVal.text('...');
        $orderVal.text('...');

        $.post(ajaxurl, {
            action: 'otm_activate_license',
            license_key: '',
            nonce: otm_admin_params.nonces.license
        }).done(function(response) {
            if (response.success && response.data) {
                var d = response.data;
                if (typeof d.order_credits_balance !== 'undefined') {
                    var oCredits2 = parseFloat(d.order_credits_balance);
                    $orderVal.text(oCredits2 > 50000 ? 'Unlimited' : oCredits2.toFixed(2));
                } else {
                    $orderVal.text(oldOrder);
                }
                if (typeof d.sms_balance !== 'undefined' && d.sms_balance !== null) {
                    $smsVal.text(parseFloat(d.sms_balance).toFixed(2));
                } else {
                    $smsVal.text(typeof d.sms_balance !== 'undefined' ? oldSms : '--.--');
                }
                if ($callVal.length) {
                    if (typeof d.call_balance !== 'undefined' && d.call_balance !== null) {
                        $callVal.text(parseFloat(d.call_balance).toFixed(2));
                    } else {
                        $callVal.text(typeof d.call_balance !== 'undefined' ? oldCall : '--.--');
                    }
                }
                if (typeof WOTM_APP !== 'undefined' && typeof WOTM_APP.showToast === 'function') {
                    WOTM_APP.showToast('Balances updated.');
                }
            } else {
                $smsVal.text(oldSms);
                if ($callVal.length) $callVal.text(oldCall);
                $orderVal.text(oldOrder);
                alert(response.data && response.data.message ? response.data.message : 'Could not fetch balances.');
            }
        }).fail(function() {
            $smsVal.text(oldSms);
            if ($callVal.length) $callVal.text(oldCall);
            $orderVal.text(oldOrder);
            alert('Request failed while checking balances.');
        }).always(function() {
            $btn.text(originalText).prop('disabled', false);
        });
    });

    // --- Telegram Notifications Tab ---
    if ($('#otm-telegram-settings-form').length) {

        $(document).on('click', '#otm-save-telegram-settings', function (e) {
            e.preventDefault();
            var $btn = $(this);
            var originalText = $btn.text();
            $btn.text('Saving...').prop('disabled', true);

            var formData = $('#otm-telegram-settings-form').serializeArray();
            var data = { action: 'otm_save_telegram_settings', nonce: otm_admin_params.nonces.telegram_settings };
            // Checkboxes that are unchecked won't appear in serializeArray — default them to 0 first
            data.otm_telegram_new_order_enabled = 0;
            data.otm_delivery_alert_enabled      = 0;
            $.each(formData, function (i, field) {
                data[field.name] = field.value;
            });

            $.post(ajaxurl, data, function (response) {
                if (response.success) {
                    if (typeof WOTM_APP !== 'undefined' && typeof WOTM_APP.showToast === 'function') {
                        WOTM_APP.showToast('Telegram settings saved successfully!');
                    } else {
                        alert('Telegram settings saved successfully!');
                    }
                } else {
                    alert('Error: ' + (response.data || 'An unknown error occurred.'));
                }
            }).fail(function () {
                alert('An AJAX error occurred. Please check your connection and try again.');
            }).always(function () {
                $btn.text(originalText).prop('disabled', false);
            });
        });

        $(document).on('click', '#otm-send-telegram-test', function (e) {
            e.preventDefault();
            var $btn = $(this);
            var originalText = $btn.text();
            $btn.text('Sending...').prop('disabled', true);

            var formData = $('#otm-telegram-settings-form').serializeArray();
            var data = { action: 'otm_telegram_send_test', nonce: otm_admin_params.nonces.telegram_test };
            $.each(formData, function (i, field) {
                data[field.name] = field.value;
            });

            $.post(ajaxurl, data, function (response) {
                alert(response.data || (response.success ? 'Done.' : 'An unknown error occurred.'));
            }).fail(function () {
                alert('An AJAX error occurred. Please check your connection and try again.');
            }).always(function () {
                $btn.text(originalText).prop('disabled', false);
            });
        });

        $(document).on('submit', '#otm-telegram-settings-form', function (e) {
            e.preventDefault();
            $('#otm-save-telegram-settings').trigger('click');
        });
    }

    // ── Custom Columns ──────────────────────────────────────────────────────

    if ($('#otm-custom-columns-card').length) {

        // Helper: collect all rows from the manual cols table as [{key, label}]
        function getManualColRows() {
            var rows = [];
            $('#otm-manual-cols-tbody tr').each(function () {
                var key   = $(this).data('key');
                var label = $(this).find('.otm-manual-col-label').val().trim();
                if (key && label) {
                    rows.push({ key: key, label: label });
                }
            });
            return rows;
        }

        // Helper: add a row to the table (or update label if key exists)
        function addManualColRow(key, label) {
            key   = $.trim(key);
            label = $.trim(label);
            if (!key || !label) return false;

            var existing = $('#otm-manual-cols-tbody tr[data-key="' + key + '"]');
            if (existing.length) {
                existing.find('.otm-manual-col-label').val(label);
                return false; // already existed, label updated
            }

            var row = $('<tr>').attr('data-key', key).append(
                $('<td>').html('<code>' + $('<span>').text(key).html() + '</code>'),
                $('<td>').append(
                    $('<input type="text" class="regular-text otm-manual-col-label">').val(label)
                ),
                $('<td>').append(
                    $('<button type="button" class="button button-small otm-delete-manual-col">Remove</button>')
                )
            );
            $('#otm-manual-cols-tbody').append(row);
            $('#otm-manual-cols-table').show();
            $('#otm-manual-cols-heading').show();
            $('#otm-no-manual-cols-msg').hide();
            return true;
        }

        // Delete row
        $('#otm-manual-cols-table').on('click', '.otm-delete-manual-col', function () {
            $(this).closest('tr').remove();
            if ($('#otm-manual-cols-tbody tr').length === 0) {
                $('#otm-manual-cols-table').hide();
                $('#otm-manual-cols-heading').hide();
                $('#otm-no-manual-cols-msg').show();
            }
        });

        // Scan order
        $('#otm-scan-order-btn').on('click', function () {
            var orderId = $('#otm-scan-order-id').val().trim();
            if (!orderId) {
                $('#otm-scan-order-msg').text('Please enter an Order ID.');
                return;
            }
            $('#otm-scan-order-msg').text('');
            $('#otm-scan-results').hide();
            $('#otm-scan-fields-tbody').empty();
            $('#otm-scan-order-spinner').addClass('is-active');

            $.post(ajaxurl, {
                action:   'otm_scan_order_meta',
                order_id: orderId,
                nonce:    otm_admin_params.nonces.scan_order_meta
            }, function (response) {
                $('#otm-scan-order-spinner').removeClass('is-active');
                if (!response.success) {
                    $('#otm-scan-order-msg').text(response.data || 'Error scanning order.');
                    return;
                }
                var fields = response.data.fields;
                var tbody  = $('#otm-scan-fields-tbody');
                tbody.empty();
                $.each(fields, function (colKey, info) {
                    var alreadyAdded = $('#otm-manual-cols-tbody tr[data-key="' + colKey + '"]').length > 0;
                    var row = $('<tr>').attr('data-key', colKey).append(
                        $('<td>').append(
                            $('<input type="checkbox" class="otm-scan-field-chk">')
                                .prop('checked', false)
                                .prop('disabled', alreadyAdded)
                        ),
                        $('<td>').html('<code>' + $('<span>').text(colKey).html() + '</code>'
                            + (alreadyAdded ? ' <em style="color:#666;font-size:12px;">(already added)</em>' : '')),
                        $('<td style="color:#555;font-size:13px;">').text(info.value),
                        $('<td>').append(
                            $('<input type="text" class="regular-text otm-scan-label-input">')
                                .val(info.suggested_label)
                                .prop('disabled', alreadyAdded)
                        )
                    );
                    tbody.append(row);
                });
                $('#otm-scan-results').show();
                $('#otm-scan-add-msg').text('');
            }).fail(function () {
                $('#otm-scan-order-spinner').removeClass('is-active');
                $('#otm-scan-order-msg').text('AJAX error. Please try again.');
            });
        });

        // Add selected scanned columns to the manual list
        $('#otm-add-scanned-cols-btn').on('click', function () {
            var added = 0;
            $('#otm-scan-fields-tbody tr').each(function () {
                var $row = $(this);
                if (!$row.find('.otm-scan-field-chk').is(':checked')) return;
                var key   = $row.data('key');
                var label = $row.find('.otm-scan-label-input').val().trim();
                if (!label) label = key;
                if (addManualColRow(key, label)) added++;
            });
            if (added > 0) {
                $('#otm-scan-add-msg').text(added + ' column(s) added to the list. Click "Save Custom Columns" to apply.');
            } else {
                $('#otm-scan-add-msg').text('No new columns selected.');
            }
        });

        // Save custom columns
        $('#otm-save-manual-columns').on('click', function () {
            var button = $(this);
            var originalText = button.text();
            var rows = getManualColRows();
            button.text('Saving...').prop('disabled', true);
            $('#otm-save-manual-spinner').addClass('is-active');
            $('#otm-save-manual-msg').text('');

            $.post(ajaxurl, {
                action:  'otm_save_manual_columns',
                columns: rows,
                nonce:   otm_admin_params.nonces.save_manual_columns
            }, function (response) {
                $('#otm-save-manual-spinner').removeClass('is-active');
                if (response.success) {
                    $('#otm-save-manual-msg').css('color', '#00a32a').text('Saved! Reloading page…');
                    setTimeout(function () { location.reload(); }, 800);
                } else {
                    button.text(originalText).prop('disabled', false);
                    $('#otm-save-manual-msg').css('color', '#d63638').text('Error saving. Please try again.');
                }
            }).fail(function () {
                $('#otm-save-manual-spinner').removeClass('is-active');
                button.text(originalText).prop('disabled', false);
                $('#otm-save-manual-msg').css('color', '#d63638').text('AJAX error. Please try again.');
            });
        });
    }

});
