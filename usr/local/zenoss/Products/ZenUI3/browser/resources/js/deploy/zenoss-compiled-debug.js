/*!
 * Copyright (c) 2009-2011 Zenoss, Inc.
 * 
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * version 2 as published by the Free Software Foundation.
 * 
 * For complete information please visit http://www.zenoss.com/oss/
 */
(function(){
    /**
     * This file contains overrides we are appyling to the Ext framework. These are default values we are setting
     * and convenience methods on the main Ext classes.
     **/




    /**
     * This ovverides the defeault field template for hidden fields.
     * This change is removing the maxLength property because if you do not you end up with
     * this error all over the place:
     *     XTemplate Error: maxLength is not defined
     *
     * http://www.sencha.com/forum/showthread.php?199148-4.1.0-The-field-of-the-type-hiddenfield-occupies-the-visile-place-in-the-form&p=795553
     **/
    Ext.override(Ext.form.field.Hidden, {
        fieldSubTpl: [ // note: {id} here is really {inputId}, but {cmpId} is available
            '<input id="{id}" type="{type}" {inputAttrTpl}',
            ' size="1"', // allows inputs to fully respect CSS widths across all browsers
            '<tpl if="name"> name="{name}"</tpl>',
            '<tpl if="value"> value="{[Ext.util.Format.htmlEncode(values.value)]}"</tpl>',
            '<tpl if="placeholder"> placeholder="{placeholder}"</tpl>',
            '<tpl if="readOnly"> readonly="readonly"</tpl>',
            '<tpl if="disabled"> disabled="disabled"</tpl>',
            '<tpl if="tabIdx"> tabIndex="{tabIdx}"</tpl>',
            '<tpl if="fieldStyle"> style="{fieldStyle}"</tpl>',
            ' class="{fieldCls} {typeCls} {editableCls}" autocomplete="off"/>',
            {
                disableFormats: true
            }
        ]
    });
    /**
      * Auto Types do not have a conversion
      * http://www.sencha.com/forum/showthread.php?198250-4.1-Ext.data.Model-regression
      * This breaks model fields that either do not have a type specified or are explicitly set
      * to auto. This is supposed to be fixed in 4.1.1
      **/
    Ext.data.Types.AUTO.convert = function (v) { return v; };

    /**
     * This makes the default value for checkboxes getSubmitValue (called by getFieldValues on the form)
     * return true/false if it is checked or unchecked. The normal default is "on" or nothing which means the
     * key isn't even sent to the server.
     **/
    Ext.override(Ext.form.field.Checkbox, {
        inputValue: true,
        uncheckedValue: false
    });

    /**
    * Splitter needs to be resized thinner based on the older UI. The default is 5
    **/
   Ext.override(Ext.resizer.Splitter, {
       width: 2
   });

    /**
     * In every one of our panels we want border and frame to be false so override it on the base class.
     **/
    Ext.override(Ext.panel.Panel, {
        frame: false,
        border: false
    });

    /**
     * Refs were removed when going from Ext3 to 4, we rely heavily on this feature and it is much more
     * concise way of accessing children so we are patching it back in.
     **/
    Ext.override(Ext.AbstractComponent, {
        initRef: function() {
            if(this.ref && !this.refOwner){
                var levels = this.ref.split('/'),
                last = levels.length,
                i = 0,
                t = this;
                while(t && i < last){
                    t = t.ownerCt;
                    ++i;
                }
                if(t){
                    t[this.refName = levels[--i]] = this;
                    this.refOwner = t;
                }
            }
        },
        recursiveInitRef: function() {
            this.initRef();
            if (Ext.isDefined(this.items)) {
                Ext.each(this.items.items, function(item){
                    item.recursiveInitRef();
                }, this);
            }
            if (Ext.isFunction(this.child)) {
                var tbar = this.child('*[dock="top"]');
                if (tbar) {
                    tbar.recursiveInitRef();
                }
                var bbar = this.child('*[dock="bottom"]');
                if (bbar) {
                    bbar.recursiveInitRef();
                }
            }
        },
        removeRef: function() {
            if (this.refOwner && this.refName) {
                delete this.refOwner[this.refName];
                delete this.refOwner;
            }
        },
        onAdded: function(container, pos) {
            this.ownerCt = container;
            this.recursiveInitRef();
            this.fireEvent('added', this, container, pos);
        },
        onRemoved: function() {
            this.removeRef();
            var me = this;
            me.fireEvent('removed', me, me.ownerCt);
            delete me.ownerCt;
        },
        removeCls : function(cls) {
          try{
            var me = this,
            el = me.rendered ? me.el : me.protoEl;
            el.removeCls.apply(el, arguments);
            return me;
            }catch(e){};
        }
    });


    /**
     * Back compat for Ext3 Component grid definitions.
     * NOTE: This only works if you follow the convention of having the xtype be the same
     * as the last part of the namespace defitions. (e.g. "Zenoss.component.foo" having an xtype "foo")
     * @param xtype
     * @param cls
     */
    Ext.reg = function(xtype, cls){
        if (Ext.isString(cls)) {
            Ext.ClassManager.setAlias(cls, 'widget.'+xtype);
        } else {
            // try to register the component
            var clsName ="Zenoss.component." + xtype;
            if (Ext.ClassManager.get(clsName)) {
                Ext.ClassManager.setAlias(clsName, 'widget.'+xtype);
            }else {
                throw Ext.String.format("Unable to to register the xtype {0}: change the Ext.reg definition from the object to a string", xtype);
            }
        }
    };

    /**
     * The Ext.grid.Panel component row selection has a flaw in it:

     Steps to recreate:
     1. Create a standard Ext.grid.Panel with multiple records in it and turn "multiSelect: true"
     Note that you can just go to the documentation page
     http://docs.sencha.com/ext-js/4-0/#!/api/Ext.grid.Panel and insert the multiSelect:
     true line right into there and flip to live preview.

     2. Select the top row, then press and hold shift and click on the second row, then the third row,
     then the fourth. You would expect to see all 4 rows selected but instead you just get the last two.

     3. For reference, release the shift and select the bottom row (4th row). Now press and hold shift
     and select the 3rd row, then the 2nd row, then the 1st row. You now see all four rows selected.

     To Fix this I have to override the Ext.selection.Model to handle the top down versus bottom up selection.
     *
     */
    Ext.override(Ext.selection.Model, {
        /**
         * Selects a range of rows if the selection model {@link #isLocked is not locked}.
         * All rows in between startRow and endRow are also selected.
         * @param {Ext.data.Model/Number} startRow The record or index of the first row in the range
         * @param {Ext.data.Model/Number} endRow The record or index of the last row in the range
         * @param {Boolean} keepExisting (optional) True to retain existing selections
         */
        selectRange : function(startRow, endRow, keepExisting, dir){
            var me = this,
                store = me.store,
                selectedCount = 0,
                i,
                tmp,
                dontDeselect,
                records = [];

            if (me.isLocked()){
                return;
            }

            if (!keepExisting) {
                me.deselectAll(true);
            }

            if (!Ext.isNumber(startRow)) {
                startRow = store.indexOf(startRow);
            }
            if (!Ext.isNumber(endRow)) {
                endRow = store.indexOf(endRow);
            }

            // WG: create a flag to see if we are swapping
            var swapped = false;
            // ---

            // swap values
            if (startRow > endRow){
                // WG:  set value to true for my flag
                swapped = true;
                // ----
                tmp = endRow;
                endRow = startRow;
                startRow = tmp;
            }

            for (i = startRow; i <= endRow; i++) {
                if (me.isSelected(store.getAt(i))) {
                    selectedCount++;
                }
            }

            if (!dir) {
                dontDeselect = -1;
            } else {
                dontDeselect = (dir == 'up') ? startRow : endRow;
            }

            for (i = startRow; i <= endRow; i++){
                if (selectedCount == (endRow - startRow + 1)) {
                    if (i != dontDeselect) {
                        me.doDeselect(i, true);
                    }
                } else {
                    records.push(store.getAt(i));
                }
            }

            //WG:  START  CHANGE
            // This is my fix, we need to flip the order
            // for it to correctly track what was selected first.
            if(!swapped){
                records.reverse();
            }
            //WG:  END CHANGE



            me.doMultiSelect(records, true);
        }
    });

    /**
     * This is a workaround to make sure the node isn't null as it has happened
     * to be on occasion. These only affect the UI class switches.
     * See Trac Ticket #29912
     **/
    Ext.override(Ext.view.AbstractView, {
        // invoked by the selection model to maintain visual UI cues
        onItemDeselect: function(record) {
            var node = this.getNode(record);
            if(node) Ext.fly(node).removeCls(this.selectedItemCls);
        },
        // invoked by the selection model to maintain visual UI cues
        onItemSelect: function(record) {
            var node = this.getNode(record);
            if(node) Ext.fly(node).addCls(this.selectedItemCls);
        }
    });


   /**
    * workaround for scrollbars missing in IE. IE ignores the parent size between parent and child
    * so we end up with the part that should have scrollbars the same size as the child, thus
    * no scrollbars. This normalizes the sizes between elements in IE only.
    **/
   Ext.override(Ext.form.ComboBox, {
    onExpand: function() {
        var me = this,
            picker = this.getPicker();

        if(Ext.isIE){
            var child = Ext.DomQuery.selectNode('#'+picker.id+' .x-boundlist-list-ct');

            Ext.defer(function(){ // defer a bit so the grandpaw will have a height
                    var grandpaw = Ext.DomQuery.selectNode('#'+picker.id);
                    child.style.cssText = 'width: 100%; height: 100%; overflow: auto;';
                }, 100, me);
        }

    }
   });


    /**
     * The Event console filters are not rendering correctly in our application. This override is a temporary workaround
     * until we can figure out exactly why it is not rendering. Instead of aborting on an failed layout, just keep
     * running (flush) and ignore the failed layout.
     **/
    Ext.override(Ext.layout.Context, {
        runComplete: function () {
            var me = this;

            me.state = 2;

            if (me.remainingLayouts) {
                me.handleFailure();
                // return false;
            }

            me.flush();

            // Call finishedLayout on all layouts, but do not clear the queue.
            me.flushLayouts('finishQueue', 'finishedLayout', true);

            // Call notifyOwner on all layouts and then clear the queue.
            me.flushLayouts('finishQueue', 'notifyOwner');

            me.flush(); // in case any setProp calls were made

            me.flushAnimations();

            return true;
        }

    });

    /**
     * The multiselect doesn't test to see if it has a valid return value.
     *
     **/
    Ext.override(Ext.ux.form.MultiSelect, {
        getSubmitValue: function() {
            var me = this,
                delimiter = me.delimiter,
                val = me.getValue();
            if (Ext.isString(val)) {
                return Ext.isString(delimiter) ? val.join(delimiter) : val;
            }
            return "";
        }
    });

    /**
     *  Fixes a bug in Ext where when the store is canceling
     *  requests and there are not any outstanding requests.
     **/
    Ext.override(Ext.data.Store, {
        cancelAllPrefetches: function() {
            var me = this,
            reqs = me.pageRequests,
            req,
            page;

            // If any requests return, we no longer respond to them.
            if (me.pageMap.events.pageadded) {
                me.pageMap.events.pageadded.clearListeners();
            }

            // Cancel all outstanding requests
            for (page in reqs) {
                if (reqs.hasOwnProperty(page)) {
                    req = reqs[page];
                    delete reqs[page];
                    if (req) {
                        delete req.callback;
                    }
                }
            }
        }
    });

    /**
     *  Fixes a bug in Ext: they forgot to make the flashParams actually work
     *  Added wmode: 'transparent' here so that IE would allow us to overlay a div
     **/
    Ext.override(Ext.flash.Component, {
        afterRender: function() {
            var me = this,
                flashParams = Ext.apply({wmode: 'transparent'}, me.flashParams),
                flashVars = Ext.apply({}, me.flashVars);

            me.callParent();

            new swfobject.embedSWF(
                me.url,
                me.getSwfId(),
                me.swfWidth,
                me.swfHeight,
                me.flashVersion,
                me.expressInstall ? me.statics.EXPRESS_INSTALL_URL : undefined,
                flashVars,
                flashParams,
                me.flashAttributes,
                Ext.bind(me.swfCallback, me)
            );
        }

    });


    /**
     * We use the guarantee range mechanism to refresh the grid without reloading the store.
     * This method is overriden so that we can refresh page 0 if necessary. Previously it would send a negative
     * number as start.
     * It was using (page - 1 * pageSize)
     **/
    Ext.override(Ext.data.Store, {
        prefetchPage: function(page, options) {
            var me = this,
            pageSize = me.pageSize || me.defaultPageSize,
            // JRH: make sure start is not less than 0 if we are prefetching the first page
            start = Math.max((page - 1) * me.pageSize, 0),
            total = me.totalCount;

            // No more data to prefetch.
            if (total !== undefined && me.getCount() === total) {
                return;
            }

            // Copy options into a new object so as not to mutate passed in objects
            me.prefetch(Ext.apply({
                page     : page,
                start    : start,
                limit    : pageSize
            }, options));
        },

        /**
         * When prefetching by default only the number of rows that are visible
         * are loaded into the store's data. This means that selection will only work
         * on the visible area, not the prefetched page.
         *
         * This method changes it to load the entire page into the data instead of the viewSize.
         *
         **/
        loadToPrefetch: function(options) {
            var me = this,
            waitForInitialRange = function() {
                if (me.rangeCached(options.start, options.limit - 1)) {
                    me.pageMap.un('pageAdded', waitForInitialRange);
                    // JRH: guaranteeRange of pagesize not viewsize
                    me.guaranteeRange(options.start, me.pageSize - 1);
                }
            };

            // Wait for the requested range to become available in the page map
            me.pageMap.on('pageAdded', waitForInitialRange);
            return me.prefetch(options || {});
        }

    });



    /**
     * This fixes the Smooth Scrolling issue in Firefox 13 and above.
     *
     **/
    Ext.define('Ext.overrides.panel.Table', {
        override: 'Ext.panel.Table',

        syncHorizontalScroll: function(left, setBody) {
            var me = this,
                scrollTarget;


            setBody = setBody === true;
            // Only set the horizontal scroll if we've changed position,
            // so that we don't set this on vertical scrolls
            if (me.rendered && (setBody || left !== me.scrollLeftPos)) {
                // Only set the body position if we're reacting to a refresh, otherwise
                // we just need to set the header.
                if (setBody) {
                    scrollTarget = me.getScrollTarget();
                    scrollTarget.el.dom.scrollLeft = left;
                }
                me.headerCt.el.dom.scrollLeft = left;
                me.scrollLeftPos = left;
            }
        }

    });

    Ext.override(Ext.grid.column.Column, {
        defaultRenderer: Ext.htmlEncode
    });

    Ext.define('Ext.data.TreeStoreOverride',{
        override: 'Ext.data.TreeStore',

        /**
         * @private
         * @param {Object[]} filters The filters array
         */
        applyFilters: function(filters){
            var me = this,
                decoded = me.decodeFilters(filters),
            i = 0,
            length = decoded.length,
            node,
            visibleNodes = [],
            resultNodes = [],
            root = me.getRootNode(),
            flattened = me.tree.flatten(),
            items,
            item,
            fn;


            /**
             * @property {Ext.util.MixedCollection} snapshot
             * A pristine (unfiltered) collection of the records in this store. This is used to reinstate
             * records when a filter is removed or changed
             */
            me.snapshot = me.snapshot || me.getRootNode().copy(null, true);

            for (i = 0; i < length; i++) {
                me.filters.replace(decoded[i]);
            }


            //collect all the nodes that match the filter
            items = me.filters.items;
            length = items.length;
            for (i = 0; i < length; i++){
                item = items[i];
                fn = item.filterFn || function(item){ return item.get(item.property) == item.value; };
                visibleNodes = Ext.Array.merge(visibleNodes, Ext.Array.filter(flattened, fn));
            }

            //collect the parents of the visible nodes so the tree has the corresponding branches
            length = visibleNodes.length;
            for (i = 0; i < length; i++){
                node = visibleNodes[i];
                node.bubble(function(n){
                    if (n.parentNode){
                        resultNodes.push(n.parentNode);
                    } else {
                        return false;
                    }
                });
            }
            visibleNodes = Ext.Array.merge(visibleNodes, resultNodes);

            //identify all the other nodes that should be removed (either they are not visible or are not a parent of a visible node)
            resultNodes = [];
            root.cascadeBy(function(n){
                if (!Ext.Array.contains(visibleNodes,n)){
                    resultNodes.push(n);
                }
            });
            //we can't remove them during the cascade - pulling rug out ...
            length = resultNodes.length;
            for (i = 0; i < length; i++){
                resultNodes[i].remove();
            }

            //necessary for async-loaded trees
            root.getOwnerTree().getView().refresh();
            root.getOwnerTree().expandAll();
            if (Ext.isFunction(root.getOwnerTree().postFilter)) {
                root.getOwnerTree().postFilter();
            }
        },
        //@inheritdoc
        filter: function(filters, value) {
            var nodes, nodeLength, i, filterFn;

                if (Ext.isString(filters)) {
                    filters = {
                        property: filters,
                        value: value
                    };
                }

            //find branch nodes that have not been loaded yet - this approach is in contrast to expanding all nodes recursively, which is unnecessary if some nodes are already loaded.
            filterFn = function(item){ return !item.isLeaf() && !(item.isLoading() || item.isLoaded()); };
            nodes = Ext.Array.filter(this.tree.flatten(), filterFn);
            nodeLength = nodes.length;

            if (nodeLength === 0){
                this.applyFilters(filters);
            } else {
                for (i = 0; i < nodeLength; i++){
                    this.load({
                        node: nodes[i],
                        callback: function(){
                            nodeLength--;
                            if (nodeLength === 0){
                                //start again & re-test for newly loaded nodes in case more branches exist
                                this.filter(filters,value);
                            }
                        },
                        scope: this
                    });
                }
            }
        },
        clearFilter: function(suppressEvent) {

            this.filters.clear();

            if (this.isFiltered()){
                this.setRootNode(this.snapshot);
                delete this.snapshot;
            }
        },
        isFiltered: function() {
            var snapshot = this.snapshot;
            return !! snapshot && snapshot !== this.getRootNode();
        }
    });




}());
(function() {
    Ext.namespace('Zenoss.flares');

    /**
     * An invisible layer that contains all the Flares.
     * Must be the highest layer in order for Flares to show up.
     */
    Ext.define('Zenoss.flares.Container', {
        extend: 'Ext.Container',
        _layoutDelay: null,
        constructor: function(config) {
            config = Ext.applyIf(config || {}, {
                id: 'flare-container',
                baseCls: 'x-flare-container',
                alignment: 't-t',
                width: '100%',
                zindex: 400000,
                items: []
            });

            this.callParent([config]);
        },
        onRender: function(ct, position) {
            this.el = ct.createChild({
                cls: this.baseCls + '-layer',
                children: [{
                    cls: this.baseCls + '-body'
                }]
            });
            this.body = this.el.child('.' + this.baseCls + '-body');
            this.el = new Ext.Layer({ zindex: this.zindex }, this.el);
            Zenoss.flares.Container.superclass.onRender.apply(this, arguments);
            this.el.alignTo(document, this.alignment);
        },
        getLayoutTarget: function() {
            return this.body;
        },
        onShow: function() {
            this.el.show();
            Zenoss.flares.Container.superclass.onShow.apply(this, arguments);
        },
        onRemove: function() {
            // Move the sticky items back to the top. Wait a few microseconds to do it in case more items are
            // being removed at the same time.
            if ( !this._layoutDelay ) {
                this._layoutDelay = new Ext.util.DelayedTask(this.doLayout, this);
            }
            this._layoutDelay.delay(500);
        },
        show: function() {
            if ( !this.rendered ) {
                this.render(Ext.getBody());
            }
            Zenoss.flares.Container.superclass.show.apply(this, arguments);
        },
        onLayout: function() {
            Ext.each(this.items.items, function(item, index, items) {
                if ( item.canLayout() ) {
                    if ( index == 0 ) {
                        item.anchorTo(this.el, this.alignment);
                    }
                    else {
                        item.anchorTo(items[index - 1].el, 'tl');
                    }
                }
            }, this);
            Zenoss.flares.Container.superclass.onLayout.apply(this, arguments);
        }
    });

    /**
     * The UI manager for flares.
     */
    Zenoss.flares.Manager = {
        container: Ext.create('Zenoss.flares.Container', {}),
        INFO: 'x-flare-info',
        ERROR: 'x-flare-error',
        WARNING: 'x-flare-warning',
        DEBUG: 'x-flare-debug',
        SUCCESS: 'x-flare-success',
        CRITICAL: 'x-flare-critical',
        _visibleFlares: new Ext.util.MixedCollection(false, function(flare) {
            return flare._bodyHtml;
        }),

        /**
         * Add the flare to the container and show it.
         *
         * @param flare Zenoss.flares.Flare
         */
        flare: function(flare) {
            var otherFlare = Zenoss.flares.Manager._visibleFlares.last();
            Zenoss.flares.Manager._visibleFlares.add(flare._bodyHtml, flare);
            // if we have other flares, make sure this one renders to the bottom of the
            // previous flares
            if (otherFlare) {
                flare.on('afterrender', function(fl){
                    fl.alignTo(otherFlare.getEl(), 'bl-bl', [0, 32]);
                });
            }else {
                flare.on('afterrender', function(fl){
                    fl.alignTo(Ext.getBody(), 'tl-tl');
                });
            }
            if(Ext.isIE){
                flare.on('afterrender', function(fl){
                // ie isn't calc width correct. must set after render to known width
                       fl.setWidth(fl.getWidth());
                });
            }
            if(Zenoss.SELENIUM){
                flare.on('afterrender', function(fl){
                    fl.getEl().query('.x-flare-message')[0].id = "flare-message-span";
                });
            }
            Zenoss.flares.Manager.container.add(flare);
            Zenoss.flares.Manager.container.doLayout();
            flare.show();
        },
        removeFlare: function(flare) {
            Zenoss.flares.Manager._visibleFlares.removeAtKey(flare._bodyHtml);
            Zenoss.flares.Manager.adjustFlares();
        },
        /**
         * Adjusts the locations of the flares, when one
         * is deleted it iterates through all the existing flares
         * and realigns their position
         **/
        adjustFlares: function() {
            var flares = Zenoss.flares.Manager._visibleFlares;
            var container = Ext.getBody(), useOffset = false;
            flares.each(function(flare){
                if (!useOffset) {
                    flare.alignTo(container, 'tl-tl');
                    useOffset = true;
                } else {
                    flare.alignTo(container, 'bl-bl', [0, 32]);
                }
                container = flare.getEl();
            });
        },
        /**
         * Format a message and create a Flare.
         *
         * @param message string A message template
         * @param type string One of the status types assigned to this class (ex: INFO, ERROR)
         * @param args array Optional orguments to fill in the message template
         */
        _formatFlare: function(message, type, args) {
            message = Ext.htmlDecode(message);        
            args = Array.prototype.slice.call(args, 1);
            var flare = new Zenoss.flares.Flare(message, args, {
                iconCls: type,
                animateTarget: Zenoss.flares.Manager.container.el
            });

            var existingFlare = Zenoss.flares.Manager._visibleFlares.get(flare._bodyHtml);
            if (existingFlare == undefined) {
                Zenoss.flares.Manager.flare(flare);
                return flare;
            }
            flare.destroy();
            return existingFlare;
        },
        /**
         * Show a Flare with the info status.
         *
         * @param message string A message template
         * @param args mixed Optional orguments to fill in the message template
         */
        info: function(message, args) {
            return Zenoss.flares.Manager._formatFlare(message, Zenoss.flares.Manager.INFO, arguments);
        },
        error: function(message, args) {
            return Zenoss.flares.Manager._formatFlare(message, Zenoss.flares.Manager.ERROR, arguments);
        },
        warning: function(message, args) {
            return Zenoss.flares.Manager._formatFlare(message, Zenoss.flares.Manager.WARNING, arguments);
        },
        debug: function(message, args) {
            return Zenoss.flares.Manager._formatFlare(message, Zenoss.flares.Manager.DEBUG, arguments);
        },
        critical: function(message, args) {
            return Zenoss.flares.Manager._formatFlare(message, Zenoss.flares.Manager.CRITICAL, arguments);
        },
        success: function(message, args) {
            return Zenoss.flares.Manager._formatFlare(message, Zenoss.flares.Manager.SUCCESS, arguments);
        }
    };

    /**
     * Flares are growl like flash messages. Used for transient notifications. Flares are
     * managed by Zenoss.flares.Manager.
     *
     * Example:
     *
     * Zenoss.flares.Manager.info('{0} was saved as {1}.', itemName, newItemName);
     */
    Ext.define('Zenoss.flares.Flare', {
        extend: 'Ext.Window',
        _bodyHtml: null,
        _task: null,
        _closing: false,
        focus: Ext.emptyFn,
        constructor: function(message, params, config) {
            if ( Ext.isArray(message) ) {
                var children = [];
                Ext.each(message, function(m) {
                    children.push({ tag: 'li', html: m });
                });

                message = Ext.DomHelper.markup({
                    tag: 'ul',
                    children: children
                });
            }

            var template =  new Ext.Template(message, { compiled: true } );
            this._bodyHtml = template.apply(params);

            Ext.applyIf(config, {
                headerAsText: false,
                bodyCls: config.iconCls || 'x-flare-info',
                baseCls: 'x-flare',
                plain: false,
                draggable: false,
                shadow: false,
                closable: true,
                resizable: false,
                delay: 5000, // How long to show the message for
                alignment: 't-t',
                duration: 0.2, // How long to do the opening slide in
                hideDuration: 1, // How long to do the closing fade out
                template: template,
                cls: 'x-flare-body',
                height: '32',
                dismissOnClick: true,
                listeners: {
                    show: function() {
                        if ( this._task ) {
                            this._task.delay(this.delay);
                        }
                    },
                    hide: function() {
                        Zenoss.flares.Manager.removeFlare(this);
                    },
                    scope: this
                },
                items: {
                    html: "<div class='x-flare-icon'></div><span class='x-flare-message'>" + this._bodyHtml + "</span>"
                }
            });
            this.callParent([config]);

        },
        initEvents: function() {
            this.callParent(arguments);
            this.mon(this.el, 'mouseover', function(){
                this.sticky();
            }, this);
            this.mon(this.el, 'mouseout', function(){
                Ext.defer(function(){
                    this.hide();
                }, 1000, this);
            }, this);
            if ( this.dismissOnClick ) {
                this.mon(this.el, 'click', function() {
                    this.hide();
                }, this);
            }
        },
        initComponent: function() {
            if ( this.delay ) {
                this._task = new Ext.util.DelayedTask(this.hide, this);
            }
            this.callParent(arguments);
        },
        /**
         * Make this Flare "stick". It will not fade away and must manually be dismissed by the user.
         */
        sticky: function() {
            if ( this._task ) {
                this._task.cancel();
                delete this._task;
            }
        },
        animShow: function() {
            this.el.slideIn('t', {
                duration: this.duration,
                callback: this._afterShow,
                scope: this
            });
        },
        close: function() {
            Zenoss.flares.Manager._visibleFlares.removeAtKey(this._bodyHtml);
            this.hide();
        },
        animHide: function() {
            Zenoss.flares.Manager._visibleFlares.removeAtKey(this._bodyHtml);
            this._closing = true;
            this.el.ghost("t", {
                duration: this.hideDuration,
                remove: false,
                callback : Ext.bind(function () {
                    this.destroy();
                }, this)
            });
        },
        canLayout: function() {
            if ( !this._closing ) {
                // Only move if it's not already closing
                return Zenoss.flares.Flare.superclass.canLayout.apply(this, arguments);
            }
        }
    });

    Ext.namespace('Zenoss.messaging');
    /**
     * Message for Zenoss.messaging.Messenger. This is for back-compat and should not be used directly.
     */
    Ext.define('Zenoss.messaging.Message',  {
        INFO: 0,        // Same as in messaging.py
        WARNING: 1,     // Same as in messaging.py
        CRITICAL: 2,    // Same as in messaging.py
        constructor: function(config) {
            config = Ext.applyIf(config || {}, {
                body: '',
                priority: this.INFO,
                sticky: false
            });
            Ext.apply(this, config);
        }
    });

    /**
     * An interface to the old messaging API. This is for back-compat and should not be used directly.
     */
    Ext.define('Zenoss.messaging.Messenger', {
        extend: 'Ext.util.Observable',
        constructor: function(config) {
            config = Ext.applyIf(config || {}, {
                interval: 30000
            });
            Ext.apply(this, config);
            this.callParent([config]);
            this.addEvents('message');
        },
        init: function() {
            this._task = new Ext.util.DelayedTask(function(){
                this.checkMessages();
            }, this);
            this._task.delay(this.interval);
            this.checkMessages()
        },
        checkMessages: function() {
            Zenoss.remote.MessagingRouter.getUserMessages({}, function(results) {
                Ext.each(results.messages, function(m) {
                    this.send(m);
                }, this);
            }, this);
        },
        send: function(msgConfig) {
            var message = new Zenoss.messaging.Message(msgConfig);
            this.fireEvent('message', this, message);

            var flare;
            if ( message.priority  === message.WARNING ) {
                flare = Zenoss.flares.Manager.warning(message.body);
            }
            else if ( message.priority  === message.CRITICAL ) {
                flare = Zenoss.flares.Manager.critical(message.body);
            }
            else {
                flare = Zenoss.flares.Manager.info(message.body);
            }

            if ( message.sticky ) {
                flare.sticky();
            }
        }
    });

    Zenoss.messenger = Ext.create('Zenoss.messaging.Messenger', {});

    Ext.onReady(function() {
        Zenoss.flares.Manager.container.show();
        Zenoss.messenger.init();
    });

    /**
     * Inform the user with a message. This is usually represented with a Flare. Use
     * this interface to alert users.
     */
    Zenoss.message = {
        /**
         * Show a message with the info status.
         *
         * @param message string A message template
         * @param args mixed Optional orguments to fill in the message template
         */
        info: function(message, args) {
            return Zenoss.flares.Manager.info.apply(null, arguments);
        },
        error: function(message, args) {
            return Zenoss.flares.Manager.error.apply(null, arguments);
        },
        warning: function(message, args) {
            return Zenoss.flares.Manager.warning.apply(null, arguments);
        },
        debug: function(message, args) {
            return Zenoss.flares.Manager.debug.apply(null, arguments);
        },
        /**
         * These messages have a critical error icon and stay until dismissed by the user.
         */
        critical: function(message, args) {
            var flare = Zenoss.flares.Manager.critical.apply(null, arguments);
            flare.sticky();
            return flare;
        },
        success: function(message, args) {
            return Zenoss.flares.Manager.success.apply(null, arguments);
        }
    };

}());
(function(){ // Local scope

/**
 * Global Ext settings.
 */
Ext.BLANK_IMAGE_URL = '/++resource++zenui/img/s.gif';

/**
 * Enable this setting to log the stack trace of all direct requests to the browser console
 **/
Zenoss.logDirectRequests = false;

    Ext.apply(Ext.direct.RemotingProvider.prototype, {
        queueTransaction: Ext.Function.createInterceptor(Ext.direct.RemotingProvider.prototype.queueTransaction, function(transaction) {
            // will render a stack trace on firefox
            if (Zenoss.logDirectRequests) {
                console.log(Ext.String.format("Router: {0} Method: {1}", transaction.action, transaction.method));
                console.trace(Ext.String.format("Router: {0} Method: {1}", transaction.action, transaction.method));
            }
        })
    });


/**
 * Base namespace to contain all Zenoss-specific JavaScript.
 */
Ext.namespace('Zenoss');

/**
 * Constants
 */

Zenoss.SEVERITY_CLEAR = 0;
Zenoss.SEVERITY_DEBUG = 1;
Zenoss.SEVERITY_INFO = 2;
Zenoss.SEVERITY_WARNING = 3;
Zenoss.SEVERITY_ERROR = 4;
Zenoss.SEVERITY_CRITICAL = 5;
Zenoss.STATUS_NEW = 0;
Zenoss.STATUS_ACKNOWLEDGED = 1;
Zenoss.STATUS_SUPPRESSED = 2;
Zenoss.STATUS_CLOSED = 3; // Closed by the user.
Zenoss.STATUS_CLEARED = 4; // Closed by a matching clear event.
Zenoss.STATUS_DROPPED = 5; // Dropped via a transform.
Zenoss.STATUS_AGED = 6; // Closed via automatic aging.

Zenoss.SELENIUM = 0;

/**
 * Namespace for anonymous scripts to attach data to avoid dumping it into
 * the global namespace.
 */
Ext.namespace('Zenoss.env');

Ext.QuickTips.init();

    /**
     *
     * @param except Return all columns except the ones
     * where id is in this array.
     */
Zenoss.env.getColumnDefinitions = function(except) {
    Ext.each(Zenoss.env.COLUMN_DEFINITIONS, function(col){
        if (Zenoss.events.customColumns[col.dataIndex]) {
            Ext.apply(col, Zenoss.events.customColumns[col.dataIndex]);
        }
    });
    if (except) {
        return Zenoss.util.filter(Zenoss.env.COLUMN_DEFINITIONS, function(d){
            return Ext.Array.indexOf(except, d.id)==-1;
        });
    }
    else {
        return Zenoss.env.COLUMN_DEFINITIONS;
    }
};

Zenoss.env.initProductionStates= function(){
    var d = Zenoss.env.productionStates;
    if (!Zenoss.env.PRODUCTION_STATES ) {
        Zenoss.env.PRODUCTION_STATES = [];
        Zenoss.env.PRODUCTION_STATES_MAP = {};
        Ext.each(d, function(item) {
            Zenoss.env.PRODUCTION_STATES.push(item);
            Zenoss.env.PRODUCTION_STATES_MAP[item.value] = item.name;
        });
    }
};

Zenoss.env.initPriorities = function(){
    var d = Zenoss.env.priorities;

    if (!Zenoss.env.PRIORITIES) {
        Zenoss.env.PRIORITIES = [];
        Zenoss.env.PRIORITIES_MAP = {};
        Ext.each(d, function(item) {
            Zenoss.env.PRIORITIES.push(item);
            Zenoss.env.PRIORITIES_MAP[item.value] = item.name;
        });
    }

};

Ext.define('Zenoss.state.PersistentProvider', {
    extend: 'Ext.state.Provider',
    directFn: Zenoss.remote.MessagingRouter.setBrowserState,
    constructor: function() {
        this.callParent(arguments);
        this.on('statechange', this.save, this);
        this.task = null;
    },
    setState: function(stateString) {
        var state = Ext.decode(stateString);
        this.state = Ext.isObject(state) ? state : {};
    },
    // Private
    save: function() {
        // in the case where we get multiple requests to
        // update the state just send one request
        if(!this.onSaveTask) {
            this.onSaveTask = new Ext.util.DelayedTask(function(){
                this.directFn(
                    {state: Ext.encode(this.state)}
                );
            }, this);
        }
        // delay for half a second
        this.onSaveTask.delay(500);
    },
    saveStateNow: function(callback, scope) {
        this.directFn(
            {state: Ext.encode(this.state)},
            function() {
                Ext.callback(callback, scope);
            }
        );
    }
});
Ext.state.Manager.setProvider(Ext.create('Zenoss.state.PersistentProvider'));

/*
 * Hook up all Ext.Direct requests to the connection error message box.
 */
Ext.Direct.on('event', function(e, provider){
    if ( Ext.isDefined(e.result) && e.result && Ext.isDefined(e.result.asof) ) {
        Zenoss.env.asof = e.result.asof || null;
    }
});

Ext.Direct.on('event', function(e){

    if ( Ext.isDefined(e.result) && e.result && Ext.isDefined(e.result.msg) && e.result.msg.startswith("ObjectNotFoundException") ) {
         new Zenoss.dialog.SimpleMessageDialog({
                title: _t('Stale Data Warning'),
                message: _t('Another user has edited the information on this page since you loaded it. Please reload the page.'),
                buttons: [{
                    xtype: 'DialogButton',
                    text: _t('OK'),
                    handler: function() {
                        window.location.reload();
                    }
                }, {
                    xtype: 'DialogButton',
                    text: _t('Cancel')
                }]
            }).show();
        return false;
    }
});

Ext.Direct.on('event', function(e){
    if (Ext.isDefined(e.result) && e.result && Ext.isDefined(e.result.msg)) {
        var success = e.result.success || false,
            sticky = e.result.sticky || false,
            flare;
        if (success) {
            flare = Zenoss.message.success(e.result.msg);
        } else {
            flare = Zenoss.message.error(e.result.msg);
        }
        if (sticky) {
            flare.sticky();
        }
    }
});


/**
 * Each time there is an ajax request we change the mouse
 * cursor to a "wait" style to signify that something is going on.
 *
 * This is entirely to provide feedback to a user that their
 * actions had an effect.
 */
function openAjaxRequests() {
    var i = 0, request;
    for (request in Ext.Ajax.requests) {
        i++;
    }
    return i;
}

function setCursorStyle(style) {
    if (document.body) {
        document.body.style.cursor = style;
    }
}

Ext.Ajax.on('beforerequest', function(){
    setCursorStyle("wait");
});

function setToDefaultCursorStyle() {
    // the number of open ajax requests is
    // what the current number is including this one
    // that is ending
    if (openAjaxRequests() <= 1) {
        setCursorStyle("default");
    }
}
Ext.Ajax.on('requestcomplete', setToDefaultCursorStyle);
Ext.Ajax.on('requestexception', setToDefaultCursorStyle);


Zenoss.env.unloading=false;

Ext.EventManager.on(window, 'beforeunload', function() {
    Zenoss.env.unloading=true;
});


Ext.Direct.on('exception', function(e) {
    if (Zenoss.env.unloading === true){
        return;
    }

    if (e.message.startswith("Error parsing json response") &&
        e.message.endswith("null")) {
        window.location.reload();
        return;
    }
    var dialogId = "serverExceptionDialog", cmp;
    cmp = Ext.getCmp(dialogId);
    if(cmp) {
        cmp.destroy();
    }

    Ext.create('Zenoss.dialog.SimpleMessageDialog', {
        id: dialogId,
        title: _t('Server Exception'),
        message: '<p>' + _t('The server reported the following error:') + '</p>' +
            '<p class="exception-message">' + e.message + '</p>' +
            '<p>' + _t('The system has encountered an error.') + ' ' +
            _t('Please reload the page.') + '</p>' ,
                buttons: [{
                    xtype: 'DialogButton',
                    text: _t('RELOAD'),
                    handler: function() {
                        window.location.reload();
                    }
                }, {
                    xtype: 'DialogButton',
                    text: _t('DISMISS')
                }]
        }).show();
});

/*
 * Hide the server exception MessageBox if we get a good response. Primarily
 * used to have the event console starting functioning after a temporary
 * inability to reach the server.
 */
Ext.Direct.on('event', function(e){
    var serverExceptionDialog = Ext.getCmp("serverExceptionDialog");
    if (serverExceptionDialog && Ext.isDefined(e.result)){
        serverExceptionDialog.hide();
        serverExceptionDialog.destroy();
    }
});


/*
* Add the ability to specify an axis for autoScroll.
* autoScroll: true works just as before, but now can also do:
* autoScroll: 'x'
* autoScroll: 'y'
*
* Code by Tom23, http://www.extjs.com/forum/showthread.php?t=80663
*/

Ext.Element.prototype.setOverflow = function(v, axis) {
    axis = axis ? axis.toString().toUpperCase() : '';
    var overflowProp = 'overflow';
    if (axis == 'X' || axis == 'Y') {
        overflowProp += axis;
    }
    if(v=='auto' && Ext.isMac && Ext.isGecko2){ // work around stupid FF 2.0/Mac scroll bar bug
        this.dom.style[overflowProp] = 'hidden';
        (function(){this.dom.style[overflowProp] = 'auto';}).defer(1, this);
    }else{
        this.dom.style[overflowProp] = v;
    }
};

Ext.override(Ext.Panel, {
    setAutoScroll : function() {
        if(this.rendered && this.autoScroll){
            var el = this.body || this.el;
            if(el){
                el.setOverflow('auto', this.autoScroll);
            }
        }
    }
});

var origGetDragData = Ext.dd.DragZone.prototype.getDragData;
Ext.override(Ext.dd.DragZone, {
    getDragData: function(e) {
        var t = Ext.lib.Event.getTarget(e);
        // If it's a link, set the target to the ancestor cell so the browser
        // doesn't do the default anchor-drag behavior. Otherwise everything
        // works fine, so proceed as normal.
        if (t.tagName=='A') {
            e.target = e.getTarget('div.x-grid3-cell-inner');
        }
        return origGetDragData.call(this, e);
    }
});


/**
 * @class Zenoss.PlaceholderPanel
 * @extends Ext.Panel
 * A custom panel that displays text in its center. This panel is styled
 * with custom CSS to look temporary. It is used to show devs the names of
 * panels and should not be seen by users.
 * @constructor
 * @param {Object} config
 * @cfg {String} text The text to be displayed in the center of the panel.
 */
Zenoss.PlaceholderPanel = Ext.extend(Ext.Panel, {
    constructor: function(config) {
        Ext.apply(config, {
            cls: 'placeholder',
            layout: 'fit',
            border: false,
            items: [{
                baseCls: 'inner',
                border: false,
                html: config.text,
                listeners: {'resize':function(ob){
                        ob.getEl().setStyle({'line-height':
                            ob.getEl().getComputedHeight()+'px'});
                }}
            }]
        });
        Zenoss.PlaceholderPanel.superclass.constructor.apply(
            this, arguments);
    }
});

/**
 * @class Zenoss.LargeToolbar
 * @extends Ext.Toolbar
 * A toolbar with greater height and custom CSS class. Used at the top of
 * several screens, including the event console.
 * @constructor
 */

Ext.define('Zenoss.LargeToolbar',{
    alias: 'widget.largetoolbar',
    extend: 'Ext.toolbar.Toolbar',
    constructor: function(config) {
        Ext.applyIf(config, {
            ui: 'large',
            cls: 'largetoolbar',
            height: 45,
            border: false
        });
        Zenoss.LargeToolbar.superclass.constructor.apply(
            this, arguments);
    }
});

Ext.define('Zenoss.SingleRowSelectionModel', {
    extend: 'Ext.selection.RowModel',
    mode: 'SINGLE',
    getSelected: function() {
        var rows = this.getSelection();
        if (!rows.length) {
            return null;
        }
        return rows[0];
    }
});

/**
 * @class Zenoss.ExtraHooksSelectionModel
 * @extends Zenoss.SingleRowSelectionModel
 * A selection model that fires extra events.
 */
Ext.define("Zenoss.ExtraHooksSelectionModel", {
    extend: "Zenoss.SingleRowSelectionModel",
    suppressDeselectOnSelect: false,
    initEvents: function() {
        Zenoss.ExtraHooksSelectionModel.superclass.initEvents.call(this);
        this.addEvents('rangeselect');
        this.on('beforeselect', function(){
            if (this.suppressDeselectOnSelect) {
                this.selectingRow = true;
            }
        }, this);
    },
    clearSelections: function() {
        if (this.selectingRow) {
            this.suspendEvents();
        }
        Zenoss.ExtraHooksSelectionModel.superclass.clearSelections.apply(this, arguments);
        if (this.selectingRow) {
            this.resumeEvents();
            this.selectingRow = false;
        }
    },
    selectRange: function (startRow, endRow, keepExisting) {
        this.suspendEvents();
        Zenoss.ExtraHooksSelectionModel.superclass.selectRange.apply(
            this, arguments);
        this.resumeEvents();
        this.fireEvent('rangeselect', this);
    }
});


/**
 * @class Zenoss.PostRefreshHookableDataView
 * @extends Ext.DataView
 * A DataView that fires a custom event after the view has refreshed.
 * @constructor
 */
Zenoss.PostRefreshHookableDataView = Ext.extend(Ext.DataView, {
    constructor: function(config) {
        Zenoss.PostRefreshHookableDataView.superclass.constructor.apply(
            this, arguments);
        this.addEvents(
            /**
             * @event afterrefresh
             * Fires after the view has been rendered.
             * @param {DataView} this
             */
            'afterrefresh');
    }
});

Ext.extend(Zenoss.PostRefreshHookableDataView, Ext.DataView, {
    /**
     * This won't survive upgrade.
     */
    refresh: function(){
        this.clearSelections(false, true);
        this.el.update("");
        var records = this.store.getRange();
        if(records.length < 1){
            if(!this.deferEmptyText || this.hasSkippedEmptyText){
                this.el.update(this.emptyText);
            }
            this.hasSkippedEmptyText = true;
            this.all.clear();
            return;
        }
        this.tpl.overwrite(this.el, this.collectData(records, 0));
        this.fireEvent('afterrefresh', this);
        this.all.fill(Ext.query(this.itemSelector, this.el.dom));
        this.updateIndexes(0);
    }
});


/**
 * @class Zenoss.MultiselectMenu
 * @extends Ext.Toolbar.Button
 * A combobox-like menu that allows one to toggle each option, and is able
 * to deliver its value like a form field.
 * @constructor
 */
Ext.define("Zenoss.MultiselectMenu", {
    extend: "Ext.button.Button",
    alias: ["widget.multiselectmenu"],
    makeItemConfig: function(text, value) {
        var config = {
            hideOnClick: false,
            handler: Ext.bind(function() {
                this.fireEvent('change');
            }, this),
            value: value,
            text: text
        };
        return config;
    },
    constructor: function(config) {
        config.menu = config.menu || [];
        Zenoss.MultiselectMenu.superclass.constructor.apply(this, arguments);
        this.initialSetValue(config);
    },
    initialSetValue: function(config) {
        var defaultValues = this.defaultValues || [];
        if (Ext.isDefined(config.store)) {
            this.hasLoaded = false;
            config.store.on('load', function(s, rows) {
                this.menu.removeAll();
                Ext.each(rows, function(row){
                    var cfg = this.makeItemConfig(row.data.name, row.data.value);
                    cfg.checked = (Ext.Array.indexOf(defaultValues, row.data.value)>-1);
                    this.menu.add(cfg);
                }, this);
                this.hasLoaded = true;
            }, this);
            config.store.load();
        } else {
            this.hasLoaded = true;
            Ext.each(config.source, function(o){
                var cfg = this.makeItemConfig(o.name, o.value);
                cfg.checked = (Ext.Array.indexOf(defaultValues, o.value)>-1);
                this.menu.add(cfg);
            }, this);
        }
    },
    reset: function() {
        this.setValue();
    },
    _initialValue: null,
    getValue: function() {
        if (!this.hasLoaded) {
            // Check state, otherwise return default
            return this._initialValue || this.defaultValues;
        }
        var result = [];
        Ext.each(this.menu.items.items, function(item){
            if (item.checked) result[result.length] = item.value;
        });
        return result;
    },
    setValue: function(val) {
        if (!val) {
            this.initialSetValue(this.initialConfig);
        } else {
            function check(item) {
                var shouldCheck = false;
                try{
                    shouldCheck = val.indexOf(item.value)!=-1;
                } catch(e) {var _x;}
                item.setChecked(shouldCheck);
            }
            if (!this.hasLoaded) {
                this._initialValue = val;
                this.menu.on('add', function(menu, item) {
                    check(item);
                });
            } else {
                Ext.each(this.menu.items.items, check);
            }
        }
    }

});

/**
 * @class Zenoss.StatefulRefreshMenu
 * @extends Ext.Menu
 * A refresh menu that is able to save and restore its state.
 * @constructor
 */
Ext.define("Zenoss.StatefulRefreshMenu", {
    extend: "Ext.menu.Menu",
    alias: ['widget.statefulrefreshmenu'],
    constructor: function(config) {
        config.stateful = true;
        config.stateEvents = ['click'];
        this.callParent([config]);
    },
    getState: function() {
        //returning raw value doesn't work anymore; need to wrap in object/array
        return [this.trigger.interval];
    },
    applyState: function(interval) {

        //old cookie value not being in an array and we can't get the value, so
        //default to 60
        var savedInterval = interval[0] || 60;
        // removing one second as an option
        // for performance reasons
        if (savedInterval == 1) {
            savedInterval = 5;
        }

        var items = this.items.items;
        Ext.each(items, function(item) {
            if (item.value == savedInterval)
                item.checked = true;
                return;
        }, this);
        this.trigger.on('afterrender', function() {
            this.trigger.setInterval(savedInterval);
        }, this);
    }
});


/**
 * @class Zenoss.RefreshMenu
 * @extends Ext.SplitButton
 * A button that manages refreshing and allows the user to set a polling
 * interval.
 * @constructor
 */
Ext.define("Zenoss.RefreshMenuButton", {
    extend: "Ext.button.Split",
    alias: ['widget.refreshmenu'],
    constructor: function(config) {
        var menu = {
            xtype: 'statefulrefreshmenu',
            id: config.stateId || 'evc_refresh',
            trigger: this,
            width: 127,
            items: [{
                cls: 'refreshevery',
                text: 'Refresh every',
                canActivate: false
            },{
                xtype: 'menucheckitem',
                text: '5 seconds',
                value: 5,
                group: 'refreshgroup'
            },{
                xtype: 'menucheckitem',
                text: '10 seconds',
                value: 10,
                group: 'refreshgroup'
            },{
                xtype: 'menucheckitem',
                text: '30 seconds',
                value: 30,
                group: 'refreshgroup'
            },{
                xtype: 'menucheckitem',
                text: '1 minute',
                value: 60,
                group: 'refreshgroup'
            },{
                xtype: 'menucheckitem',
                text: 'Manually',
                value: -1,
                group: 'refreshgroup'
            }]
        };
        Ext.applyIf(config, {
            menu: menu
        });
        this.callParent([config]);
        this.refreshTask = new Ext.util.DelayedTask(this.poll, this);
        this.menu.on('click', function(menu, item){
            this.setInterval(item.value);
        }, this);
        // 60 is the default interval; it matches the checked item above
        this.setInterval(60);
    },
    setInterval: function(interval) {
        var isValid = false;
        // make sure what they are setting is a valid option
        this.menu.items.each(function(item){
            if (item.value == interval) {
                isValid = true;
            }
        });
        if (isValid) {
            this.interval = interval;
            this.refreshTask.delay(this.interval*1000);
        }
    },
    poll: function(){
        if (this.interval>0) {
            if ( !this.disabled ) {
                if (Ext.isDefined(this.pollHandler)){
                    this.pollHandler();
                }
                else{
                    this.handler(this);
                }
            }
            this.refreshTask.delay(this.interval*1000);
        }
    }
});


/*
 * This EventActionManager class will handle issuing a router request for
 * actions to be taken on events. When constructing this class you must
 * provide the findParams() method and may provide the onFinishAction() method.
 * Unless you mimic the existing params structure, you'll need to override
 * isLargeRequest() as well in order to determine whether or not a dialog and
 * progress bar should be shown.
 *
 * Example to configure the EventActionManager:
 *    Zenoss.EventActionManager.configure({
 *       findParams: function() { ... },
 *       onFinishAction: function() { ... }
 *    });
 *
 * Examples to execute a router request, once configured:
 *    Zenoss.EventActionManager.execute(Zenoss.remote.MyRouter.foo);
 *
 * Here's how it works. This runs execute() which stores the passed router
 * method in variable me.action, and stores findParams() result in me.params.
 * It then calls startAction() which opens a progress dialog for large requests
 * then calls run(), which actually calls the router method with the params.
 * When the router finishes it calls requestCallback() with three cases:
 * error, complete, or incomplete. While incomplete it'll loop by calling run(),
 * which this time calls Router.nextEventSummaryUpdate() instead of the original
 * router method. Once complete it calls finishAction() to hide the progress
 * dialog and call the configured onFinishAction().
 *
 * In summary:
 *    execute() --> startAction() --> open progress dialog, then run() -->
 *    remote router method on server (with params) --> requestCallback() -->
 *    [if incomplete then calls run() to keep looping] -->
 *    finishAction() --> hide progress dialog, then onFinishAction().
 */
Ext.define("EventActionManager", {
    extend: "Ext.util.Observable",
    constructor: function(config) {
        var me = this;
        config = config || {};
        Ext.applyIf(config, {
            cancelled: false,
            dialog: new Ext.Window({
                width: 300,
                modal: true,
                title: _t('Processing...'),
                layout: 'anchor',
                closable: false,
                bodyBorder: false,
                border: false,
                hideBorders: true,
                plain: true,
                buttonAlign: 'left',
                stateful:false,
                items: [{
                    xtype: 'panel',
                    ref: 'panel',
                    layout: 'anchor',
                    items: [{
                        xtype: 'box',
                        ref: '../status',
                        autoEl: {
                            tag: 'p',
                            html: _t('Processing...')
                        },
                        height: 20
                    },{
                        xtype: 'progressbar',
                        width: 270,
                        unstyled: true,
                        ref: '../progressBar'
                    }]
                }],
                buttons: [{
                    xtype: 'DialogButton',
                    text: _t('Cancel'),
                    ref: '../cancelButton',
                    handler: function(btn, evt) {
                        me.cancelled = true;
                        me.finishAction();
                    }
                }]
            }),
            events: {
                'updateRequestIncomplete': true,
                'updateRequestComplete': true
            },
            listeners: {
                updateRequestIncomplete: function(data) {
                    if (!me.cancelled) {
                        me.run();
                    }
                },
                updateRequestComplete: function(data) {
                    me.finishAction();
                }
            },
            isLargeRequest: function() {
                // determine if this request is going to require batch
                // requests. If you have selected more than 100 ids, show
                // a progress bar. also if you have not selected ANY and
                // are just executing on a filter, we don't have any idea
                // how many will be updated, so show a progress bar just
                // in case.
                return me.params.evids.length > 100 || me.params.evids.length == 0;
            },
            action: function(params, callback) {
                throw('The EventActionManager action must be implemented before use.');
            },
            startAction: function() {
                me.cancelled = false;
                if (me.isLargeRequest()) {
                    me.dialog.show();
                    me.dialog.status.update(_t('Processing...'));
                }
                me.run();
            },
            run: function() {
                // First request
                if (me.next_request === null) {
                    Ext.apply(me.params, {limit: 100})
                    me.action(me.params, me.requestCallback);
                }
                else {
                    Zenoss.remote.EventsRouter.nextEventSummaryUpdate({next_request: me.next_request},
                            me.requestCallback);
                }
            },
            finishAction: function() {
                me.dialog.hide();
                if (me.onFinishAction) {
                    me.onFinishAction();
                }
            },
            requestCallback: function(provider, response) {
                var data = response.result.data;

                // no data due to an error. Handle it.
                if (!data) {
                    new Zenoss.dialog.ErrorDialog({message: _t('There was an error handling your request.')});
                    me.finishAction();
                    return;
                }

                me.eventsUpdated += data.updated;
                if (data.next_request) {
                    me.next_request = data.next_request;
                    // don't try to update the progress bar if it hasn't
                    // been created due to this being a small request.
                    if (me.isLargeRequest()) {
                        var progress = data.next_request.offset/data.total;
                        me.dialog.status.update(Ext.String.format(_t('Progress: {0}%'), Math.ceil(progress*100)));
                        me.dialog.progressBar.updateProgress(progress);
                    }
                    me.fireEvent('updateRequestIncomplete', {data:data});
                }else {
                    if(me.dialog.isVisible()){
                        // this is still flagged as being a large request so shows the dialog
                        // but there is no next_request, so just show a one pass progress
                        me.dialog.progressBar.wait({
                            interval: 120,
                            duration: 1200,
                            increment: 10,
                            text: '',
                            scope: this,
                            fn: function(){
                                me.next_request = null;
                                me.fireEvent('updateRequestComplete', {data:data});
                            }
                        });
                    }else{
                        me.next_request = null;
                        me.fireEvent('updateRequestComplete', {data:data});
                    }
                }
            },
            reset: function() {
                me.eventsUpdated = 0;
                me.next_request = null;
                me.dialog.progressBar.reset();
            },
            findParams: function() {
                throw('The EventActionManager findParams() method must be implemented before use.');
            },
            execute: function(actionFunction) {
                me.action = actionFunction;
                me.params = me.findParams();
                if (me.params) {
                    me.reset();
                    me.startAction();
                }
            },
            configure: function(config) {
                Ext.apply(this, config);
            }
        });
        Ext.apply(this, config);
        EventActionManager.superclass.constructor.call(this, config);
    }
});


Ext.onReady(function() {
    Zenoss.EventActionManager = new EventActionManager();
});

/**
 * @class Zenoss.ColumnFieldSet
 * @extends Ext.form.FieldSet
 * A FieldSet with a column layout
 * @constructor
 */
Ext.define("Zenoss.ColumnFieldSet", {
    extend: "Ext.form.FieldSet",
    alias: ['widget.ColumnFieldSet'],
    constructor: function(userConfig) {

        var baseConfig = {
            items: {
                layout: 'column',
                border: false,
                items: userConfig.__inner_items__,
                defaults: {
                    layout: 'anchor',
                    border: false,
                    bodyStyle: 'padding-left: 15px'
                }
            }
        };

        delete userConfig.__inner_items__;
        var config = Ext.apply(baseConfig, userConfig);
        Zenoss.ColumnFieldSet.superclass.constructor.call(this, config);

    } // constructor
}); // Zenoss.ColumnFieldSet

/**
 * General utilities
 */
Ext.namespace('Zenoss.util');

/*
* Wrap the Ext.Direct remote call passed in as func so that calls to the
* wrapped function won't be sent in a batch. If you have an expensive call that
* you really want to run in parallel with the rest of the page, wrap it in
* this.
*
* e.g. {directFn: isolatedRequest(Zenoss.remote.DeviceRouter.getTree)}
*/
Zenoss.util.isolatedRequest = function(func) {
    var provider = Ext.Direct.getProvider(func.directCfg.action),
        combineAndSend = Ext.bind(provider.combineAndSend, provider),
        newFn;
    newFn = Ext.Function.createSequence(Ext.Function.createInterceptor(func, combineAndSend),
                                combineAndSend);
    newFn.directCfg = Ext.clone(func.directCfg);
    return newFn;
};


Zenoss.util.isSuccessful = function(response) {
    // Check the results of an Ext.Direct response for success.
    return response.result && response.result.success;
};

Zenoss.util.addLoadingMaskToGrid = function(grid){
    // load mask stuff
    grid.store.proxy.on('beforeload', function(){
        var container = this.container;
        container._treeLoadMask = container._treeLoadMask || new Ext.LoadMask(this.container);
        var mask = container._treeLoadMask;
        mask.show();
    }, grid);
    grid.store.proxy.on('load', function(){
        var container = this.container;
        container._treeLoadMask = container._treeLoadMask || new Ext.LoadMask(this.container);
        var mask = container._treeLoadMask;
        mask.hide();
    }, grid);
}

Zenoss.env.SEVERITIES = [
    [5, 'Critical'],
    [4, 'Error'],
    [3, 'Warning'],
    [2, 'Info'],
    [1, 'Debug'],
    [0, 'Clear']
];

Zenoss.util.convertSeverity = function(severity){
    if (Ext.isString(severity)) return severity;
    var sevs = ['clear', 'debug', 'info', 'warning', 'error', 'critical'];
    return sevs[severity];
};

Zenoss.util.convertStatus = function(stat){
    var stati = ['New', 'Acknowledged', 'Suppressed'];
    return stati[stat];
};

Zenoss.util.render_severity = function(sev) {
    return Zenoss.render.severity(sev);
};

Zenoss.util.render_status = function(stat) {
    return Zenoss.render.evstatus(stat);
};

Zenoss.util.render_linkable = function(name, col, record) {
    var url = record.data[col.id + '_url'];
    var title = record.data[col.id + '_title'] || name;
    if (url) {
        return '<a href="'+url+'">'+title+'</a>';
    } else {
        return title;
    }
};


Zenoss.util.render_device_group_link = function(name, col, record) {
    var links = record.data.DeviceGroups.split('|'),
        returnString = "",
        link = undefined;
    // return a pipe-deliminated set of links to the ITInfrastructure page
    for (var i = 0; i < links.length; i++) {
        link = links[i];
        if (link) {
            returnString +=  '&nbsp;|&nbsp;' + Zenoss.render.DeviceGroup(link, link) ;
        }
    }

    return returnString;
};


Zenoss.util.base64 = {
    base64s : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",
    encode: function(decStr){
        if (typeof btoa === 'function') {
             return btoa(decStr);
        }
        var base64s = this.base64s,
            i = 0,
            encOut = "",
            bits, dual, x, y, z;
        while(decStr.length >= i + 3){
            x = (decStr.charCodeAt(i) & 0xff) <<16;
            i++;
            y = (decStr.charCodeAt(i) & 0xff) <<8;
            i++;
            z = decStr.charCodeAt(i) & 0xff;
            i++;
            bits = x | y | z;
            encOut += base64s.charAt((bits & 0x00fc0000) >>18) +
                      base64s.charAt((bits & 0x0003f000) >>12) +
                      base64s.charAt((bits & 0x00000fc0) >> 6) +
                      base64s.charAt((bits & 0x0000003f));
        }
        if(decStr.length -i > 0 && decStr.length -i < 3){
            dual = Boolean(decStr.length -i -1);
            x = ((decStr.charCodeAt(i) & 0xff) <<16);
            i++;
            y = (dual ? (decStr.charCodeAt(i) & 0xff) <<8 : 0);
            bits = x | y;
            encOut += base64s.charAt((bits & 0x00fc0000) >>18) +
                      base64s.charAt((bits & 0x0003f000) >>12) +
                      (dual ? base64s.charAt((bits & 0x00000fc0) >>6) : '=') + '=';
        }
        return(encOut);
    },
    decode: function(encStr){
        if (typeof atob === 'function') {
            return atob(encStr);
        }
        var base64s = this.base64s;
        var bits;
        var decOut = "";
        var i = 0;
        for(; i<encStr.length; i += 4){
            bits = (base64s.indexOf(encStr.charAt(i)) & 0xff) <<18 |
                   (base64s.indexOf(encStr.charAt(i +1)) & 0xff) <<12 |
                   (base64s.indexOf(encStr.charAt(i +2)) & 0xff) << 6 |
                   base64s.indexOf(encStr.charAt(i +3)) & 0xff;
            decOut += String.fromCharCode((bits & 0xff0000) >>16,
                                          (bits & 0xff00) >>8, bits & 0xff);
        }
        if(encStr.charCodeAt(i -2) == 61){
            return(decOut.substring(0, decOut.length -2));
        }
        else if(encStr.charCodeAt(i -1) == 61){
            return(decOut.substring(0, decOut.length -1));
        }
        else {
            return(decOut);
        }
    }
};

// two functions for converting IP addresses
Zenoss.util.dot2num = function(dot) {
    var d = dot.split('.');
    return ((((((+d[0])*256)+(+d[1]))*256)+(+d[2]))*256)+(+d[3]);
};

Zenoss.util.num2dot = function(num) {
    var d = num % 256;
    for (var i = 3; i > 0; i--) {
        num = Math.floor(num/256);
        d = num%256 + '.' + d;
    }
    return d;
};

Zenoss.util.setContext = function(uid) {
    var ids = Array.prototype.slice.call(arguments, 1);
    Ext.each(ids, function(id) {
        Ext.getCmp(id).setContext(uid);
    });
};

/**
 * Doing Ext.each's job for it. If it's an array, do Ext.each, if the obj has an each function, use it instead.
 * @param {Object} obj Array or MixedCollection works here
 * @param {Function} filterFn
 * @param {Object} scope
 */
Zenoss.util.each = function(obj, filterFn, scope) {
    if ( Ext.isFunction(obj.each) ) {
        obj.each(filterFn, scope);
    }
    else {
        Ext.each(obj, filterFn, scope);
    }
};

/**
 * Return an array filtered by function argument; Filter function should
 * return true if a value should be included in the filtered result
 * @param {Object} arr array to be filtered
 * @param {Object} filterFn function used to filter
 */
Zenoss.util.filter = function(arr, filterFn, scope) {
    var result = [];

    Zenoss.util.each(arr, function(val) {
        var include = filterFn.call(scope || this, val);
        if (include) {
            result.push(val);
        }
    });

    return result;
};

/**
 * Copies all the properties of values to orig only if they already exist.
 * @param {Object} orig The receiver of the properties
 * @param {Object} values The source of the properties
 * @return {Object} returns orig
 **/
Zenoss.util.applyNotIf = function(orig, values) {
    var k;
    if (orig) {
        for (k in values) {
            if (k in orig) {
                orig[k] = values[k];
            }
        }
    }
    return orig;
};

/**
 * Calls a function when a component is available. If it is already
 * available then the function is called immediately
 * @param {String} componentId The id of the component we want available
 * @param {Function} func Callable function, no arguments
 * @param {Object} scope (optional) the scope in which we want to call this func
 **/
Zenoss.util.callWhenReady = function(componentId, func, scope) {
    var cmp = Ext.getCmp(componentId);
    if (Ext.isDefined(cmp)){
        if (scope){
            Ext.bind(func, scope)();
        }else{
            func();
        }
    }else{
        Ext.ComponentMgr.onAvailable(componentId, func, scope);
    }

};

/**
 * This converts server side types to Ext Controls,
 * it first looks for specific types based on the field name
 * and then reverts to a translation of the type.
 * @param {string} fieldId the "name" of the field (e.g. eventClass)
 * @param {string} type can be string, int, etc
 * @returns {string} The "xtype" of the control
 **/
Zenoss.util.getExtControlType = function(fieldId, type) {
    var customControls = {
        'eventClass': 'EventClass',
        'severity': 'Severity',
        'dsnames': 'DataPointItemSelector'
    },
    types = {
        'int': 'numberfield',
        'string': 'textfield',
        'boolean': 'checkbox',
        'text': 'textarea'
    };

    // see if a component of this type is registered (then return it)
    if (Ext.ComponentMgr.isRegistered(fieldId)) {
        return fieldId;
    }

    // check our conversions defined above
    if (customControls[fieldId]) {
        return customControls[fieldId];
    }

    // default to "textfield" if we don't have it set up yet"
    return (types[type] || 'textfield');
};

/**
 * @class Zenoss.DateRange
 * @extends Ext.form.field.Date
 * A DateRange
 */
Ext.define("Zenoss.DateRange", {
    extend: "Ext.form.field.Date",
    alias: ['widget.DateRange'],
    xtype: "daterange",
    getErrors: function(value) {
        var errors = new Array();
        if (value == "") {
            return errors;
        }
        //Look first for invalid characters, fail fast
        if (/[^0-9TO :-]/.test(value)) {
            errors.push("Date contains invalid characters - valid characters include digits, dashes, colons, and spaces");
            return errors;
        }
        if (value.indexOf("TO") === -1) {
            if (!Zenoss.date.regex.ISO8601Long.test(value)) {
                errors.push("Date is formatted incorrectly - format should be " + Zenoss.date.ISO8601Long);
                return errors;
            }
        }
        else {
            if (!Zenoss.date.regex.ISO8601LongRange.test(value)) {
                errors.push("Date range is formatted incorrectly - format should be " + Zenoss.date.ISO8601LongRange.replace(/\\/g, ''));
                return errors;
            }
        }
        return errors;
    },
    getValue: function() {
        // Counting on getErrors() to sanitize input before executing this code
        var value = this.getRawValue();
        if (!value) {
            return "";
        }
        var has_TO = (value.indexOf("TO") === -1) ? false : true;
        if (has_TO) {
            var retVal = value.replace(" TO ", "/");
            return retVal.replace(" ", "T");
        }
        else {
            return value.replace(" ", "T");
        }
    },
    parseDate: function(value) {
        var newVal = Ext.form.field.Date.prototype.parseDate.call(this, value);
        Ext.iterate(Zenoss.date.regex, function(key, regex) {
            if (regex.test(value)) {
                newVal = value;
                return false;
            }
        })
        return newVal;
    }
});

/**
 * Used by classes to validate config options that
 * are required.
 * Called like this:
 *      Zenoss.util.validateConfig(config, 'store', 'view');
 **/
Zenoss.util.validateConfig = function() {
    var config = arguments[0];
    Ext.each(arguments, function(param){
        if (Ext.isString(param) && !Ext.isDefined(config[param])){
            var error =  Ext.String.format("Did not receive expected config options: {0}", param);
            if (Ext.global.console) {
                // will show a stacktrace in firebug
                console.error(error);
            }
        };
    });
};

/**
 * Proxy that will only allow one request to be loaded at a time.  Requests
 * made while the proxy is already loading a previous requests will be discarded
 */
Zenoss.ThrottlingProxy = Ext.extend(Ext.data.DirectProxy, {
    constructor: function(config){
        Zenoss.ThrottlingProxy.superclass.constructor.apply(this, arguments);
        this.loading = false;
        //add event listeners for throttling
        this.addListener('beforeload', function(proxy, options){
            if (!proxy.loading){
                proxy.loading = true;
                return true;
            }
            return false;
        });
        this.addListener('load', function(proxy, options){
            proxy.loading = false;
        });
        this.addListener('exception', function(proxy, options){
            proxy.loading = false;
        });

    }
});

/**
 * Zenoss date patterns and manipulations
 */
Ext.namespace('Zenoss.date');

/**
 * A set of useful date formats. All dates should come from the server as
 * ISO8601Long, but we may of course want to render dates in many different
 * ways.
 */
Ext.apply(Zenoss.date, {
    ISO8601Long:"Y-m-d H:i:s",
    ISO8601Short:"Y-m-d",
    ShortDate: "n/j/Y",
    LongDate: "l, F d, Y",
    FullDateTime: "l, F d, Y g:i:s A",
    MonthDay: "F d",
    ShortTime: "g:i A",
    LongTime: "g:i:s A",
    SortableDateTime: "Y-m-d\\TH:i:s",
    UniversalSortableDateTime: "Y-m-d H:i:sO",
    YearMonth: "F, Y",
    ISO8601LongRange: "Y-m-d H:i:s \\T\\O Y-m-d H:i:s",
    // Hack, forgive me
    LongRangeAndDefault: Ext.form.field.Date.prototype.altFormats + '|' + Zenoss.date.ISO8601LongRange,
    regex: {
        ISO8601LongRange: /^(19|20)\d\d-(0[1-9]|1[012])-(0[1-9]|[12][0-9]|3[01]) ([01][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9]) TO (19|20)\d\d-(0[1-9]|1[012])-(0[1-9]|[12][0-9]|3[01]) ([01][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9])$/,
        ISO8601Long: /^(19|20)\d\d-(0[1-9]|1[012])-(0[1-9]|[12][0-9]|3[01]) ([01][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9])$/
    }
});

// Fix an IE bug
Ext.override(Ext.Shadow, {
    realign: Ext.Function.createInterceptor(Ext.Shadow.prototype.realign,
        function(l, t, w, h) {
            if (Ext.isIE) {
                var a = this.adjusts;
                a.h = Math.max(a.h, 0);
            }
        }
    )
});

// Force checkbox to fire valid
var oldcbsetvalue = Ext.form.Checkbox.prototype.setValue;
Ext.override(Ext.form.Checkbox, {
    setValue: function(v) {
        var result = oldcbsetvalue.call(this, v);
        this.fireEvent('valid', this);
        return result;
    }
});

String.prototype.startswith = function(str){
    return (this.match('^'+str)==str);
};

String.prototype.endswith = function(str){
    return (this.match(str+'$')==str);
};


/* Readable dates */

var _time_units = [
    ['year',   60*60*24*365],
    ['month',  60*60*24*30],
    ['week',   60*60*24*7],
    ['day',    60*60*24],
    ['hour',   60*60],
    ['minute', 60],
    ['second', 1]
];

Date.prototype.readable = function(precision) {
    var diff = (new Date().getTime() - this.getTime())/1000,
        remaining = Math.abs(diff),
        result = [];
    for (i=0;i<_time_units.length;i++) {
        var unit = _time_units[i],
            unit_name = unit[0],
            unit_mult = unit[1],
            num = Math.floor(remaining/unit_mult);
        remaining = remaining - num * unit_mult;
        if (num) {
            result.push(num + " " + unit_name + (num>1 ? 's' : ''));
        }
        if (result.length == precision) {
            break;
        }
    }
    var base = result.join(' ');
    return diff >= 0 ? base + " ago" : "in " + base;
}


/* Cross-Browser Split 1.0.1
(c) Steven Levithan <stevenlevithan.com>; MIT License
An ECMA-compliant, uniform cross-browser split method
http://blog.stevenlevithan.com/archives/cross-browser-split
*/

var cbSplit;

// avoid running twice, which would break `cbSplit._nativeSplit`'s reference to the native `split`
if (!cbSplit) {

cbSplit = function (str, separator, limit) {
    // if `separator` is not a regex, use the native `split`
    if (Object.prototype.toString.call(separator) !== "[object RegExp]") {
        return cbSplit._nativeSplit.call(str, separator, limit);
    }

    var output = [],
        lastLastIndex = 0,
        flags = (separator.ignoreCase ? "i" : "") +
                (separator.multiline  ? "m" : "") +
                (separator.sticky     ? "y" : ""),
        separator = RegExp(separator.source, flags + "g"), // make `global` and avoid `lastIndex` issues by working with a copy
        separator2, match, lastIndex, lastLength;

    str = str + ""; // type conversion
    if (!cbSplit._compliantExecNpcg) {
        separator2 = RegExp("^" + separator.source + "$(?!\\s)", flags); // doesn't need /g or /y, but they don't hurt
    }

    /* behavior for `limit`: if it's...
    - `undefined`: no limit.
    - `NaN` or zero: return an empty array.
    - a positive number: use `Math.floor(limit)`.
    - a negative number: no limit.
    - other: type-convert, then use the above rules. */
    if (limit === undefined || +limit < 0) {
        limit = Infinity;
    } else {
        limit = Math.floor(+limit);
        if (!limit) {
            return [];
        }
    }

    while (match = separator.exec(str)) {
        lastIndex = match.index + match[0].length; // `separator.lastIndex` is not reliable cross-browser

        if (lastIndex > lastLastIndex) {
            output.push(str.slice(lastLastIndex, match.index));

            // fix browsers whose `exec` methods don't consistently return `undefined` for nonparticipating capturing groups
            if (!cbSplit._compliantExecNpcg && match.length > 1) {
                match[0].replace(separator2, function () {
                    for (var i = 1; i < arguments.length - 2; i++) {
                        if (arguments[i] === undefined) {
                            match[i] = undefined;
                        }
                    }
                });
            }

            if (match.length > 1 && match.index < str.length) {
                Array.prototype.push.apply(output, match.slice(1));
            }

            lastLength = match[0].length;
            lastLastIndex = lastIndex;

            if (output.length >= limit) {
                break;
            }
        }

        if (separator.lastIndex === match.index) {
            separator.lastIndex++; // avoid an infinite loop
        }
    }

    if (lastLastIndex === str.length) {
        if (lastLength || !separator.test("")) {
            output.push("");
        }
    } else {
        output.push(str.slice(lastLastIndex));
    }

    return output.length > limit ? output.slice(0, limit) : output;
};

cbSplit._compliantExecNpcg = /()??/.exec("")[1] === undefined; // NPCG: nonparticipating capturing group
cbSplit._nativeSplit = String.prototype.split;

} // end `if (!cbSplit)`

// for convenience...
String.prototype.xsplit = function (separator, limit) {
    return cbSplit(this, separator, limit);
};

Ext.ns("Zenoss.settings");

Zenoss.settings.deviceMoveIsAsync = function(devices) {
    switch (Zenoss.settings.deviceMoveJobThreshold) {
        case 0:
            return true;
        case -1:
            return false;
        default:
            var len, threshold = Zenoss.settings.deviceMoveJobThreshold || 5;
            if (devices == null) {
                len = 0;
            } else if (!Ext.isArray(devices)) {
                len = 1;
            } else {
                len = devices.length;
            }
            return threshold <= len;
    }
}

})(); // End local scope
(function () {


    /**
     * Base class for non paginated and paginated stores.
     * @class Zenoss.Store
     */
    Ext.define('Zenoss.Store', {
        extend:'Ext.data.Store',
        firstLoad: true,
        constructor:function (config) {
            this.callParent([config]);
            this.addEvents(
                /**
                 * @event afterguaranteedrange
                 * This fires after the callback from the guaranteerange method.
                 * @param {Zenoss.Store} this
                 */
                'afterguaranteedrange'
            );
        },
        setBaseParam:function (key, value) {
            this.proxy.extraParams[key] = value;
        },
        setParamsParam:function (key, value) {
            if (! this.proxy.extraParams.params)
                this.proxy.extraParams.params = {};
            this.proxy.extraParams.params[key] = value;
        },
        onGuaranteedRange: function(range, start, end, options) {
            this.callParent(arguments);
            this.fireEvent('afterguaranteedrange', this);
        }
    });



    /**
     * Base Configuration for direct stores
     * @class Zenoss.DirectStore
     */
    Ext.define('Zenoss.DirectStore', {
        extend:'Zenoss.Store',
        alias:'store.zendirectstore',
        constructor:function (config) {
            config = config || {};
            Ext.applyIf(config, {
                remoteSort:true,
                pageSize:config.pageSize || 50,
                buffered: true,
                sorters:[
                    {
                        property:config.initialSortColumn,
                        direction:config.initialSortDirection || 'ASC'
                    }
                ],
                proxy:{
                    type:'direct',
                    simpleSortMode: true,
                    directFn:config.directFn,
                    extraParams: config.baseParams || {},
                    reader:{
                        root:config.root || 'data',
                        totalProperty:config.totalProperty || 'totalCount'
                    }
                }
            });
            this.callParent(arguments);
        }
    });

    /**
     * @class Zenoss.NonPaginatedStore
     * @extends Ext.data.Store
     * Direct Store for when you want all of the results on a single
     * grid.
     * Use this if the expected number of rows is always going to be less than
     * a hundred or so since every request will load the entire grid without pagination.
     **/
    Ext.define('Zenoss.NonPaginatedStore', {
        extend:'Zenoss.Store',
        alias:['store.directcombo'],
        constructor:function (config) {
            config = config || {};
            Ext.applyIf(config, {
                remoteSort:false,
                buffered:false,
                proxy:{
                    type:'direct',
                    limitParam:undefined,
                    startParam:undefined,
                    pageParam:undefined,
                    sortParam: undefined,
                    extraParams: config.baseParams || {},
                    directFn:config.directFn,
                    reader:{
                        type:'json',
                        root:config.root || 'data'
                    }
                }
            });
            this.callParent(arguments);
        },
        setContext:function (context) {
            if (this.proxy.extraParams) {
                this.proxy.extraParams.uid = context;
            }
            this.load();
        }
    });

    Ext.define('Ext.ux.grid.FilterRow', {
        extend:'Ext.util.Observable',

        init:function (grid) {
            this.grid = grid;

            // when column width programmatically changed
            grid.headerCt.on('columnresize', this.resizeFilterField, this);
            grid.headerCt.on('columnshow', this.resetFilterRow, this);
            grid.headerCt.on('columnhide', this.resetFilterRow, this);
            
            grid.headerCt.on('columnmove', this.resetFilterRow, this);
            grid.on('columnmove', function(col, moved, movedIndex){
            	this.gridColumnMoveWithFilter(col, moved, movedIndex);
            }, this);
            this.view = this.grid.getView();
            this.view.on('bodyscroll', this.onViewScroll, this);
        },
        /**
         * Make sure that when we scroll to the left on the grid that we adjust the
         * filters to scroll as well.
         **/
        onViewScroll: function(e) {
            if (e) {
                var viewScrollLeft = this.view.el.dom.scrollLeft,
                    // need to scroll the inner container for the changes to be noticed
                    innerEl = this.dockedFilter.el.dom.childNodes[0],
                    scrollLeft = innerEl.scrollLeft;
                if (viewScrollLeft != scrollLeft) {
                    innerEl.scrollLeft = viewScrollLeft;
                }
            }
        },
        gridColumnMoveWithFilter: function(column, moved, movedIndex){
            var grid = this.grid;
            var me = this;
            var filterBar = me.dockedFilter;
            if (filterBar) {
                me.eachColumn(function (col) {
                    if (Ext.isDefined(col.filterField)) {
                        col.filterField.destroy();
                        delete col.filterField;
                    }
                });

                // remove all the filters
                filterBar.removeAll(true);

                Ext.each(grid.getDockedItems(), function (item) {
                    if (item.id == grid.id + 'docked-filter') {
                        grid.removeDocked(item, true);
                    }
                });

                me.applyTemplate();
                // force the columns to relayout themselves (work around
                // a bug in Chrome where this would be a blank row otherwise)
                me.eachColumn(function(col){
                    if (col.isVisible() && col.getEl()) {
                        col.setWidth(col.getWidth() + 1);
                        col.setWidth(col.getWidth() - 1);
                        return false;
                    }
                });
            }

        },
        applyTemplate:function () {
            var searchItems = [],
                defaultFilters = this.defaultFilters;
            // set the default params
            this.eachColumn(function (col) {
                // this is the value we are going to send to the server
                // for this filter
                if (!col.filterKey) {
                    col.filterKey = col.id;
                    if (!col.filterKey || col.filterKey.startswith("gridcolumn")) {
                        col.filterKey = col.dataIndex;
                    }
                }
                var filterDivId = this.getFilterDivId(col.filterKey);

                if (!col.filterField) {
                    if (Ext.isDefined(col.filter) && col.filter === false) {
                        col.filter = {};
                        col.filter.xtype = 'hidden';
                    }
                    if (col.nofilter || col.isCheckerHd != undefined) {
                        col.filter = { };
                    } else if (!col.filter) {
                        col.filter = { };
                        col.filter.xtype = 'textfield';
                    }

                    col.filter = Ext.apply({
                        id:filterDivId,
                        hidden:col.isHidden(),
                        xtype:'component',
                        baseCls:'x-grid-filter',
                        width:col.width - 2,
                        enableKeyEvents:true,
                        style:{
                            margin:'1px 1px 1px 1px'
                        },
                        hideLabel:true,
                        value:this.defaultFilters[col.filterKey]
                    }, col.filter);
                    col.filterField = Ext.ComponentManager.create(col.filter);

                } else {
                    if (col.hidden != col.filterField.hidden) {
                        col.filterField.setVisible(!col.hidden);
                    }
                }
                if(Zenoss.SELENIUM){
                    col.filterField.on('afterrender', function(e){
                        if(Ext.getCmp(e.id).inputEl){
                            /*  add an id to the input element of filters if
                                it has one. If not, don't worry about it.
                                example: events_grid-filter-devices-input
                                -- for selenium automation --
                            */
                            var filterInput = Ext.getCmp(e.id).inputEl;
                            filterInput.dom.id = e.id+"-input";
                        }
                    }, this);
                }

                if (Zenoss.settings.enableLiveSearch) {
                    col.filterField.on('change', this.onChange, this);
                }
                col.filterField.on('keydown', this.onKeyDown, this);
                col.filterField.on('validitychange', this.onInvalidFilter, this);

                searchItems.push(col.filterField);
            });
            // make sure we send our default filters on the initial load
            if (!Ext.isEmpty(this.defaultFilters)) {
                if (!this.grid.store.proxy.extraParams) {
                    this.grid.store.proxy.extraParams = {};
                }
                Ext.applyIf(this.grid.store.proxy.extraParams.params, this.getSearchValues());
            }

            if (searchItems.length > 0) {
                this.grid.addDocked(this.dockedFilter = Ext.create('Ext.container.Container', {
                    id:this.grid.id + 'docked-filter',
                    weight:100,
                    dock:'top',
                    border:false,
                    baseCls:Ext.baseCSSPrefix + 'grid-header-ct',
                    items:searchItems,
                    layout:{
                        type:'hbox'
                    }
                }));

            }
            this.grid.on('afterrender', function(){
               /* using storeSearch here to force the filters to acknowledge the fact that there
                  may be new filters since the last time the page was visited. This is questionable
                  and probably should be considered temporary until a better solution to filters
                  can be found
               */
               this.storeSearch();
            }, this, {single: true});
        },
        clearFilters:function () {
            var me = this;
          /* when using .reset(), it applies setValue(), which in turn applies the
            previous value. In the case of multiselect, it adds duplicates to the list instead of resetting it.
            Hardwiring a reset for each of the changed multiselections here to disallow dupes and firing the onChange manually.
            This only fires if any of the multiselects have been changed, otherwise it only resets the text fields.
          */
          this.eachColumn(function (col) {
                if (Ext.isDefined(col.filterField)) {
                    if(col.filterField.isXType("multiselectmenu") ){
                        var dirty = false;
                        col.filterField.menu.items.each(function(f){
                            if(f.checked != f.initialConfig.checked){
                                f.setChecked(f.initialConfig.checked);
                                dirty = true;
                            }
                        });
                        if (dirty == true){
                            this.onChange();
                        }
                    }else{
                        col.filterField.reset();
                    }
                }
            });
        },
        getState:function () {
            return this.getSearchValues();
        },
        applyState:function (state) {
            if (Ext.isEmpty(state)) {
                return;
            }
            if (!this.dockedFilter) {
                this.applyTemplate();
            }
            this.eachColumn(function (col) {
                col.filterField.setVisible(!col.isHidden());
                // do not apply a filter to a hidden column (will be confusing for the user)
                if (!col.isHidden() && 
                    Ext.isDefined(state[col.filterKey]) && 
                    !Ext.isEmpty(state[col.filterKey])) {
                        col.filterField.setValue(state[col.filterKey]);
                }
            });
        },
        onChange:function (field, newValue, oldValue) {
            if (!this.onChangeTask) {
                this.onChangeTask = new Ext.util.DelayedTask(function () {
                    this.storeSearch();
                }, this);
            }

            this.onChangeTask.delay(1000);

        },
        onKeyDown:function (field, e) {

            // if they explicitly pressed enter then search now
            if (e.getKey() == e.ENTER) {
                this.onChange();
            }
        },
        /**
         * Determines if the current set of filters are all valid.
         * If any one filter is invalid the set of filters is invalid
         **/
        isValid: function() {
            var isValid = true;
            this.eachColumn(function(col){
                if (col.filterField.isValid) {
                    isValid = isValid && col.filterField.isValid();
                }
            }, this);

            return isValid;
        },
        /**
         * Flare the user when we have an invalid filter.
         **/
        onInvalidFilter: function(field, isValid) {
            if (!isValid) {
                var error = field.activeError;
                if ( error ) {
                    Zenoss.message.error(error);
                }
            }
        },
        getSearchValues:function () {
            var values = {},
                globbing = (this.appendGlob && (Ext.isDefined(globbing) ? globbing : true));
            this.eachColumn(function (col) {
                var filter = col.filterField, excludeGlobChars = ['*', '"', '?'], query;
                if (filter && filter.xtype != 'component') {
                    if (!Ext.isEmpty(filter.getValue())) {
                        query = filter.getValue();
                        if (globbing && filter.xtype == 'textfield' && filter.vtype != 'numcmp' &&
                            filter.vtype != 'numrange' && filter.vtype != 'floatrange' &&
                            Ext.Array.indexOf(excludeGlobChars,query.charAt(query.length - 1)) === -1) {
                            query += '*';
                        }
                        values[col.filterKey] = query;
                    }
                }
            });
            values = Ext.applyIf(values, this.defaultFilters);
            return values;
        },

        storeSearch:function () {
            // do not store the filters if they are not valid
            if (!this.isValid()) {
                return;
            }
            var values = this.getSearchValues();
            if (!this.grid.store.proxy.extraParams) {
                this.grid.store.proxy.extraParams = {};
            }
            // this will make sure that all subsequent buffer loads have the parameters
            this.grid.store.proxy.extraParams.params = values;

            // reset their scrolling when the filters change
            this.grid.scrollToTop();

            // only load the store if a context has been applied
            if (Ext.isDefined(this.grid.getContext()) || this.grid.getStore().autoLoad) {
                this.grid.getStore().load({
                    callback:function () {
                        this.grid.fireEvent('filterschanged', this.grid, values);
                    },
                    scope:this
                });
            }

            // save the state
            this.grid.saveState();
        },

        resetFilterRow:function () {
            this.eachColumn(function (col) {
                if (!col.filterField) {
                    return;
                }
                col.filterField.setVisible(!col.isHidden());
            });

            if (!this.dockedFilter) {
                this.applyTemplate();
            }
        },

        resizeFilterField:function (headerCt, column, newColumnWidth) {
            var editor;
            if (!column.filterField) {
                //This is because of the reconfigure
                this.resetFilterRow();
                editor = this.grid.headerCt.items.findBy(
                    function (item) {
                        return item.dataIndex == column.dataIndex;
                    }).filterField;
            } else {
                editor = column.filterField;
            }

            if (editor) {
                editor.setWidth(newColumnWidth - 2);
            }
        },

        scrollFilterField:function (e, target) {
            var width = this.grid.headerCt.el.dom.firstChild.style.width;
            this.dockedFilter.el.dom.firstChild.style.width = width;
            this.dockedFilter.el.dom.scrollLeft = target.scrollLeft;
        },

        // Returns HTML ID of element containing filter div
        getFilterDivId:function (columnId) {
            return this.grid.id + '-filter-' + columnId;
        },

        // Iterates over each column that has filter
        eachFilterColumn:function (func) {
            this.eachColumn(function (col, i) {
                if (col.filterField) {
                    func.call(this, col, i);
                }
            });
        },
        setFilter:function (colId, value) {
            this.eachColumn(function (col) {
                if (col.filterKey == colId) {
                    col.filterField.setValue(value);
                }
            });
        },
        // Iterates over each column in column config array
        eachColumn:function (func) {
            Ext.each(this.grid.columns, func, this);
        }
    });

    /**
     * @class Zenoss.ContextGridPanel
     * @extends Ext.grid.GridPanel
     * Base class for all of our grids that have a context.
     * @constructor
     */
    Ext.define('Zenoss.ContextGridPanel', {
        extend:'Ext.grid.Panel',
        alias:['widget.contextgridpanel'],
        selectedNodes:[],
        constructor:function (config) {
            var viewConfig = config.viewConfig || {};

            Zenoss.util.validateConfig(config,
                'store',
                'columns');
            viewConfig = config.viewConfig || {};

            Ext.applyIf(viewConfig, {
                autoScroll:false,
                stripeRows:true,
                loadMask:true,
                preserveScrollOnRefresh: true
            });

            Ext.applyIf(config, {
                scroll:'both',
                viewConfig:viewConfig
            });
            this.callParent([config]);
            this.getStore().on("afterguaranteedrange", function () {
                if (!this._disableSavedSelection) {
                    this.applySavedSelection();
                }
            }, this);

            // once a uid is set always send that uid
            this.getStore().on('beforeprefetch', function (store, operation) {
                if (!operation) {
                    return true;
                }

                this.start = operation.start;
                this.limit = operation.limit;
                if (!Ext.isDefined(operation.params)) {
                    operation.params = {};
                }
                if (this.uid) {
                    operation.params.uid = this.uid;
                }
                this.applyOptions(operation);
                return true;

            }, this);
            this.addEvents(
                /**
                 * @event beforeactivate
                 * Fires when the context of the grid panel changes
                 * @param {Ext.Component} this
                 * @param {String} contextId
                 */
                'contextchange'
            );
        },
        saveSelection:function () {
            this.selectedNodes = this.getSelectionModel().getSelection();
        },
        disableSavedSelection: function(bool) {
            this._disableSavedSelection = bool;
        },
        applySavedSelection:function () {
            var curStore = this.getStore(),
                selModel = this.getSelectionModel(),
                i, node, rec,
                items = [];
            for (i = 0; i < this.selectedNodes.length; i ++) {
                node = this.selectedNodes[i];
                // idProperty is usually UID or EVID in the case of events, but it has to uniquely identify the record
                rec = curStore.findRecord(node.idProperty, node.get(node.idProperty));
                if (rec) {
                    items.push(rec);
                }
            }

            if (items.length > 0) {
                this.suspendEvents();
                this.getSelectionModel().select(items, false, true);
                this.resumeEvents();
                selModel.fireEvent('selectionchange', selModel, selModel.getSelection());
                this.selectedNodes = [];
            }
        },
        clearSavedSelections: function() {
            this.selectedNodes = [];
        },
        applyOptions:function (options) {
            // Do nothing in the base implementation
        },
        /**
         * This will add a parameter to be sent
         * back to the server on every request for this store.
         **/
        setStoreParameter:function (name, value) {
            var store = this.getStore();
            if (!store.proxy.extraParams) {
                store.proxy.extraParams = {};
            }
            store.proxy.extraParams[name] = value;
        },
        setContext:function (uid) {
            var store = this.getStore();
            this.uid = uid;
            this.setStoreParameter('uid', uid);
            this.fireEvent('contextchange', this, uid);
            // speed up the initial page load
            if (store.buffered && store.firstLoad) {
                store.guaranteeRange(0, store.pageSize - 1);
                store.firstLoad = false;
            } else {
                this.getStore().load();
            }

        },
        getContext:function () {
            return this.uid;
        },
        refresh:function () {
            // only refresh if we have a context set
            if (!this.getContext()) {
                return;
            }
            this.saveSelection();
            this.getStore().load();
        }
    });


    /**
     * @class Zenoss.BaseGridPanel
     * @extends Zenoss.ContextGridPanel
     * Base class for all of our Live Grids.
     * @constructor
     */
    Ext.define('Zenoss.BaseGridPanel', {
        extend:'Zenoss.ContextGridPanel',
        alias:['widget.basegridpanel'],
        constructor:function (config) {
            Ext.applyIf(config, {
                verticalScrollerType:'paginggridscroller',
                invalidateScrollerOnRefresh:false,
                scroll:'both',
                verticalScroller: {
                    numFromEdge: config.store.pageSize <= 25 ? 5 : Math.pow(config.store.pageSize, .7),
                    scrollToLoadBuffer: 100
                },
                bbar: {
                    cls: 'commonlivegridinfopanel',
                    items: [
                        '->',
                    {
                        xtype:'livegridinfopanel',
                        grid:this
                    }]
                }
            });
            this.callParent([config]);
        },
        initComponent: function() {
            this.callParent(arguments);
            this.headerCt.on('columnhide', this.onColumnChange, this);
            this.headerCt.on('columnshow', this.onColumnChange, this);
        },
        /**
         * Listeners for when you hide/show a column, the data isn't fetched yet so
         * we need to refresh the grid to get it. Otherwise there will be a blank column
         * until the page is manually refreshed.
         **/
        onColumnChange:function () {
            if (!this.onColumnChangeTask) {
                this.onColumnChangeTask = new Ext.util.DelayedTask(function () {
                    this.refresh();
                }, this);
            }

            // give them one second to hide/show other columns
            this.onColumnChangeTask.delay(1000);
        },
        setContext: function(uid) {
            this.scrollToTop();
            if (this.getStore().pageMap) {
                this.getStore().pageMap.clear();
            }
            this.callParent([uid]);
        },
        refresh:function (callback, scope) {
            // only refresh if a context is set
            if (!this.getContext()) {
                return;
            }
            this.saveSelection();
            var store = this.getStore(),
                // load the entire store if we are not paginated or the entire grid fits in one buffer
                shouldLoad =  ! store.buffered || store.getCount() >= store.getTotalCount();

            if (shouldLoad) {
                store.load({
                    callback: callback,
                    scope: scope || this
                });
            } else {
                // need to refresh the current rows, without changing the scroll position
                var start = Math.max(store.lastRequestStart, 0),
                    end = Math.min(start + store.pageSize - 1, store.totalCount),
                    page = store.pageMap.getPageFromRecordIndex(end);
                // make sure we do not have the current view records in cache
                store.pageMap.removeAtKey(page);
                // this will fetch from the server and update the view since we removed it from cache
                if (Ext.isFunction(callback)) {
                    store.guaranteeRange(start, end, callback, scope);
                } else {
                    store.guaranteeRange(start, end);
                }
            }

        },
        scrollToTop:function () {
            var view = this.getView();
            if (view.getEl()) {
                view.getEl().dom.scrollTop = 0;
            }
        }

    });


    /**
     * @class Zenoss.FilterGridPanel
     * @extends Zenoss.BaseGridPanel
     * Sub class of the base grid that allows adds filters to the columns.
     * @constructor
     */
    Ext.define('Zenoss.FilterGridPanel', {
        extend:'Zenoss.BaseGridPanel',
        alias:['widget.filtergridpanel'],
        constructor:function (config) {
            config = config || {};
            Ext.applyIf(config, {
                displayFilters:true,
                // only make it stateful if we have an id set
                stateful: Ext.isDefined(config.id),
                stateId: config.id
            });

            this.callParent(arguments);
        },
        initComponent:function () {
            /**
             * @event filterschanged
             * Fires after the filters are changed but after the store is reloaded
             * @param {Zenoss.FilterGridPanel} grid The grid panel.
             * @param {Object} filters Key/value pair of the new filters.
             */
            this.addEvents('filterschanged');
            this.callParent();
            // create the filter row
            var filters = Ext.create('Ext.ux.grid.FilterRow', {
                grid:this,
                appendGlob:this.appendGlob,
                defaultFilters:this.defaultFilters || {}
            });

            if (this.displayFilters) {
                filters.init(this);
            }
            this.filterRow = filters;
        },
        getState:function () {
            var state = this.callParent();
            state.filters = this.filterRow.getState();
            return state;
        },
        applyState:function (state) {
            this.callParent([state]);
            if (this.displayFilters) {
                this.filterRow.applyState(state.filters);
            }
        },
        getFilters:function () {
            return this.filterRow.getSearchValues();
        },
        setFilter:function (colId, value) {
            this.filterRow.setFilter(colId, value);
        },
        afterRender:function() {
            this.callParent();
            this.applyState(this.getState());
        }
    });

    /**
     * @class Zenoss.LiveGridInfoPanel
     * @extends Ext.toolbar.TextItem
     * Toolbar addition that displays, e.g., "Showing 1-10 of 100 Rows"
     * @constructor
     * @grid {Object} the GridPanel whose information should be displayed
     */
    Ext.define('Zenoss.LiveGridInfoPanel', {
        extend:'Ext.toolbar.TextItem',
        alias:['widget.livegridinfopanel'],
        cls:'livegridinfopanel',
        initComponent:function () {
            this.setText(this.emptyMsg);
            if (this.grid) {
                if (!Ext.isObject(this.grid)) {
                    this.grid = Ext.getCmp(this.grid);
                }
                this.view = this.grid.getView();
                // We need to refresh this when one of two events happen:
                //  1.  The data in the data store changes
                //  2.  The user scrolls.
                this.grid.getStore().on('datachanged', this.onDataChanged, this);
                /*  added this guaranteedrange hack to make up for the ext bug where-by
                    updating store doesn't fire the datachanged except on load.
                */
                this.grid.getStore().on('guaranteedrange', this.onDataChanged, this);
                this.view.on('bodyscroll', this.onScroll, this);
                this.view.on('resize', this.onResize, this);
            }
            this.scrollLeft = 0;
            this.rowHeight = null;
            this.visibleRows = null;
            this.displayMsg = _t('DISPLAYING {0} - {1} of {2} ROWS');
            this.emptyMsg = _t('NO RESULTS');
            this.callParent(arguments);
        },
        onResize: function() {
            this.visibleRows = null;
            this.onScroll();
        },
        getNumberOfVisibleRows: function() {
            if (this.visibleRows) {
                return this.visibleRows;
            }

            var gridHeight, rowHeight;

            gridHeight = this.view.el.getHeight();

            // this assumes that all rows are uniform height
            // and can not change
            var node = this.view.getNode(0),
                el = Ext.fly(node);
            // make sure the first row is rendered
            if (el) {
                this.rowHeight = el.getHeight();
            }

            if (this.rowHeight && gridHeight) {
                this.visibleRows = Math.floor(gridHeight / this.rowHeight);
                return this.visibleRows;
            }
            return 0;
        },
        getEndCount: function(start) {
            var numrows = this.getNumberOfVisibleRows();
            if (numrows){
                return start + numrows + 1;
            }
            // we either aren't fully rendered yet or
            // there aren't any rows
            return 0;
        },
        getStartCount: function() {
            var scrollTop = this.view.el.dom.scrollTop;

            if (this.rowHeight && scrollTop) {
                return Math.ceil(scrollTop / this.rowHeight);
            }

            // ask the scroller
            if (this.grid.verticalScroller){
                var start = this.grid.verticalScroller.getFirstVisibleRowIndex();
                if (start) {
                    return start;
                }
            }
            return 0;
        },
        onDataChanged:function () {
            var totalCount = this.grid.getStore().getTotalCount();
            this.totalCount = totalCount;
            if (totalCount && totalCount > 0) {
                this.onScroll();
            } else {
                this.setText(this.emptyMsg);
            }
        },
        onScroll: function(e, t) {
            // introduce a small delay so that we are
            // are not constantly updating the text when they are scrolling like crazy
            if (!this.onScrollTask){
                this.onScrollTask = new Ext.util.DelayedTask(this._doOnScroll, this);
            }
            this.onScrollTask.delay(250);
        },
        _doOnScroll: function() {
            var pagingScroller = this.grid.verticalScroller;
            // ext will fire the scroll event sometimes before the data is even set
            if (!this.totalCount) {
                return this.setText(this.emptyMsg);
            }
            if (pagingScroller) {
                var start = Math.max(this.getStartCount(), 0),
                    end = Math.min(this.getEndCount(start), this.totalCount),
                    currentScrollLeft = this.view.el.dom.scrollLeft,
                    msg;

                msg = Ext.String.format(this.displayMsg, start + 1, end, this.totalCount);

                if (this.scrollLeft != currentScrollLeft) {
                    this.scrollLeft = currentScrollLeft;
                } else {
                    // only redraw the text if we're scrolling vertically; the DOM scrollLeft decrement is a HACK
                    // to work around a (suspected) ExtJS bug that causes the headers to become misaligned
                    this.setText(msg);
                    this.view.el.dom.scrollLeft -= 1;
                }
            } else {
                // Drat, we didn't have the paging scroller, so assume we are showing all
                var showingAllMsg = _t('Found {0} records');
                var msg = Ext.String.format(showingAllMsg, this.totalCount);
                this.setText(msg);
            }

        }
    });

}());
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


/* package level */
(function() {
     // NOTE: All permissions are handled on the server, this is just to
     // enhance the user experience
     Ext.ns('Zenoss.Security');

     // Defined in ZenUI3/security/security.py this is a dictionary of all the
     // permissions the current user has on the current context.
     var all_permissions = _global_permissions(),
         callbacks = [];

     /**
      * The main method for ACL on the front end. It asks
      * if the current user has this permission.
      * The permissions are defined in Zope
      *
      * NOTE: The permissions are not case-sensitive here
      * @returns True/False if the user has permission or not
      **/
     Zenoss.Security.hasPermission = function(permission) {
         // uses all_permissions as a closure
         return all_permissions[permission.toLowerCase()];
     };

     /**
      * Asks if the current user has this permission in the
      * global context.
      * @returns True/False if the user has the permission or not
      **/
     Zenoss.Security.hasGlobalPermission = function(permission) {
         return _global_permissions()[permission.toLowerCase()];
     };

     /**
      * Convenience method, it makes the Hide and Disable properties
      * easier to read.
      * For instance:
      *      config {
      *           hidden: Zenoss.Security.doesNotHavePermission('Manage DMD');
      *      };
      * @returns True if the user does NOT have permission
      **/
     Zenoss.Security.doesNotHavePermission = function(permission) {
         return (!this.hasPermission(permission));
     };

     /**
      * Add an callback to be executed every time the permissions
      * are changed, usually this is done by changing context.
      * Example Usage:
      *     Zenoss.Security.onPermissionChange(function() {
      *         Ext.getCmp('foo').setDisabled(Zenoss.Security.doesNotHavePermission('Manage DMD'));
      * });
      *@param callback: function to execute
      *@param scope[Optional]: scope of the callback
      **/
     Zenoss.Security.onPermissionsChange = function(callback, scope) {
         if (scope) {
             callbacks.push(Ext.bind(callback, scope));
         }else {
             callbacks.push(callback);
         }
     };

     /**
      * If the context you are working on changes call this
      * method to update the security permissions for that new context
      **/
     Zenoss.Security.setContext = function(uid) {
         var params = {
             uid:uid
         };
         function callback(response) {
             var i;
             if (response.success) {
                 all_permissions = response.data;
                 if (callbacks) {
                     for (i = 0; i < callbacks.length; i += 1) {
                         callbacks[i]();
                     }
                 }
             }
         }
         Zenoss.remote.DetailNavRouter.getSecurityPermissions(params, callback);

     };

}());
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


(function() {
    Ext.ns('Zenoss.Action');

    Ext.define('Zenoss.PermissionableAction', {
        externallyDisabled: false,
        permitted: false,
        filtered: false,
        updateDisabled: function() {
            this.setDisabled(this.checkDisabled());
        },
        checkDisabled: function() {
            if (this.externallyDisabled) return true;
            if (!this.permitted && !this.filtered) return true;
            return false;
        },
        checkPermitted: function() {
            if (this.permission) {
                if (this.permissionContext) {
                    if (Zenoss.env.PARENT_CONTEXT == this.permissionContext) {
                        return Zenoss.Security.hasPermission(this.permission);
                    } else {
                        return Zenoss.Security.hasGlobalPermission(this.permission);
                    }
                } else {
                    return !Zenoss.Security.doesNotHavePermission(this.permission);
                }
            } else {
                return true;
            }
        },
        setPermission: function(config) {
            var me = this;
            var recheck = function() {
                me.permitted = me.checkPermitted();
                me.updateDisabled();
            }
            // if they set the permissions config property
            // and the logged in user does not have permission, disable this element
            if (config.permission) {
                this.permission = config.permission;
                // register the control to be disabled or enabled based on the current context
                if (config.permissionContext) {
                    this.permissionContext = config.permissionContext;
                    Zenoss.Security.onPermissionsChange(recheck);
                } else {
                    // update when the context changes
                    Zenoss.Security.onPermissionsChange(recheck, this);
                }
            }
            this.permitted = this.checkPermitted();
        }
    });

    function setDisabled(disable) {
        this.externallyDisabled = disable;
        this.callParent([this.checkDisabled()]);
    }

    Ext.define("Zenoss.Action", {
        extend: "Ext.menu.Item",
        alias: ['widget.Action'],
        mixins: {
            permissions: 'Zenoss.PermissionableAction'
        },
        constructor: function(config){
            this.setPermission(config);
            this.filtered = config.filtered;
            config.disabled = this.checkDisabled();
            this.callParent([config]);
        },
        setDisabled: setDisabled
    });

    Ext.define("Zenoss.ActionButton", {
        extend: "Ext.button.Button",
        alias: ['widget.buttonaction'],
        mixins: {
            permissions: 'Zenoss.PermissionableAction'
        },
        constructor: function(config){
            this.setPermission(config);
            this.filtered = config.filtered;
            config.disabled = this.checkDisabled();
            this.callParent([config]);
        },
        setDisabled: setDisabled
    });
}());
(function(){

var _tm = {
    'IpAddress':        ["^/zport/dmd/.*/ipaddresses/[^/]*/?$"],
    'IpInterface':      ["^/zport/dmd/Devices/.*/devices/.*/os/interfaces/.*"],
    'Device':           ["^/zport/dmd/.*/devices/[^/]*/?$"],
    'DeviceLocation':   ["^/zport/dmd/Locations/"],
    'DeviceSystem':     ["^/zport/dmd/Systems/"],
    'DeviceGroup':      ["^/zport/dmd/Groups/"],
    'DeviceClass':      ["^/zport/dmd/Devices(/(?!devices)[^/]+)*/?$"],
    'EventClass':       ["^/zport/dmd/Events(/[A-Za-z][^/]*)*/?$"],
    'Network':          ["^/zport/dmd/Networks(/(?!ipaddresses)[^/]+)*/?$"],
    'Process':          ["^/zport/dmd/Processes(.*)$"]
};

var T = Ext.ns('Zenoss.types');

Ext.apply(T, {

    TYPES: {},

    getAllTypes: function() {
        var result = [];
        for (var k in T.TYPES) {
            if (true) {
                result.push(k);
            }
        }
        return result;
    }, // getAllTypes

    type: function(uid) {
        var _f;
        for (var type in T.TYPES) {
            if (T.TYPES[type]) {
                _f = true;
                Ext.each(T.TYPES[type], function(test) {
                    if (!_f) return;
                    _f = test.test(uid);
                });
                if (_f) return type;
            }
        }
        return null;
    }, // getType

    register: function(config) {
        function addRegex(k, t) {
            var types = T.TYPES[k] = T.TYPES[k] || [];
            if (!(t instanceof RegExp)) {
                t = new RegExp(t);
            }
            if (!(t in types)) types.push(t);
        }
        for (var k in config) {
            var t = config[k];
            if (Ext.isString(t)) {
                addRegex(k, t);
            } else if (Ext.isArray(t)) {
                Ext.each(t, function(r) {
                    addRegex(k, r);
                });
            }

        }
    } // register

}); // Ext.apply

T.register(_tm);

})(); // End local scope
(function(){

Ext.ns('Zenoss.render');

// templates for the events renderer
var iconTemplate = new Ext.Template(
    '<td class="severity-icon-small {severity} {cssclass}" title="{acked} out of {total} acknowledged">{total}</td>');
iconTemplate.compile();

var rainbowTemplate = new Ext.Template(
    '<table class="eventrainbow eventrainbow_cols_{count}"><tr>{cells}</tr></table>');
rainbowTemplate.compile();

var upDownTemplate = new Ext.Template(
    '<span class="status-{0}{2}">{1}</span>');
upDownTemplate.compile();

var ipInterfaceStatusTemplate = new Ext.Template(
    '<span title="Administrative / Operational">{adminStatus} / {operStatus}</span>');
ipInterfaceStatusTemplate.compile();

function convertToUnits(num, divby, unitstr, places){
    unitstr = unitstr || "B";
    places = places || 2;
    divby = divby || 1024.0;
    var units = [];
    Ext.each(['', 'K', 'M', 'G', 'T', 'P'], function(p){
        units.push(p+unitstr);
    });
    var sign = 1;
    if (num < 0) {
        num = Math.abs(num);
        sign = -1;
    }
    var i;
    for (i=0;i<units.length;i++) {
        if (num<divby) {
            break;
        }
        num = num/divby;
    }
    return (num*sign).toFixed(places) + units[i];
}

function pingStatusBase(bool) {
	/*
	 * The "bool" variable can be null, undefined, a string, or a boolean.
	 * We need to handle all cases and also make sure they are
	 * handled in proper order.
	 */
	if (bool == null || !Ext.isDefined(bool)) {
        return 'Unknown';
    }
    
    if(Ext.isString(bool)){
    	if(bool.toLowerCase() == "none"){
    		return 'Unknown';
    	}else{
    		bool = bool.toLowerCase() == 'up';
    	}
    }
    
    var str = bool ? 'Up' : 'Down';
    return str;
}

Ext.apply(Zenoss.render, {

    bytesString: function(num) {
        return num===0 ? '0' :convertToUnits(num, 1024.0, 'B');
    },

    memory: function(mb) {
        return (mb === 0) ? '0' : convertToUnits(mb, 1024.0, 'B', 2);
    },

    cpu_speed: function(speed) {
        if (speed) {
            var n = parseFloat(speed);
            if (isNaN(n)) {
                return speed;
            } else {
                return convertToUnits(n, 1000, 'Hz', 2)
            }
        } else {
            return speed;
        }
    },

    checkbox: function(bool) {
        if (bool) {
            return '<input type="checkbox" checked="true" disabled="true">';
        } else {
            return '<input type="checkbox" disabled="true">';
        }
    },

    pingStatus: function(bool) {
        var str = pingStatusBase(bool);
        return upDownTemplate.apply([str.toLowerCase(), str]);
    },

    pingStatusLarge: function(bool) {
        var str = pingStatusBase(bool);
        return upDownTemplate.apply([str.toLowerCase(), str, '-large']);
    },

    upDownUnknown: function(status,displayString){
        return upDownTemplate.apply([status.toLowerCase(),displayString]);
    },

    upDownUnknownLarge: function(status,displayString){
        return upDownTemplate.apply([status.toLowerCase(),displayString,'-large']);
    },

    ipInterfaceStatus: function(ifStatus) {
        return ipInterfaceStatusTemplate.apply(ifStatus);
    },

    ipAddress: function(ip) {
        if (Ext.isObject(ip)) {
            ip = ip.name;
        }
        if (!ip||ip=='0.0.0.0') {
            return '';
        }
        return Ext.isString(ip) ? ip : Zenoss.util.num2dot(ip);
    },

    severity: function(sev) {
        return '<div class="severity-icon-small '+
            Zenoss.util.convertSeverity(sev) +
            '"'+'><'+'/div>';
    },

    // renders availability as a percentage with 3 digits after decimal point
    availability: function(value) {
        return Ext.util.Format.number(value*100, '0.000%');
    },

    evstatus: function(evstatus) {
        if (!evstatus){
            return '';
        }
        return '<div class="status-icon-small-'+evstatus.toLowerCase()+'"><'+'/div>';
    },

    events: function(value, count) {
        var result = '',
            sevs = ['critical', 'error', 'warning', 'info', 'debug', 'clear'],
            cssclass = '',
            total,
            acked;
        count = count || 3;
        Ext.each(sevs.slice(0, count), function(severity) {
            total = value[severity].count;
            acked = value[severity].acknowledged_count;
            cssclass = (total===0) ? 'no-events' : (total===acked) ? 'acked-events' : '';
            result += iconTemplate.apply({
                severity: severity,
                total: total,
                acked: acked,
                cssclass: cssclass
            });
        });
        return rainbowTemplate.apply({cells: result, count: count});
    },
    worstevents: function(value) {
        var result = '',
            sevs = ['critical', 'error', 'warning', 'info', 'debug', 'clear'],
            cssclass = '',
            total,
            acked;
        Ext.each(sevs, function(severity) {
            if (value[severity] && value[severity].count && !result) {
                total = value[severity].count;
                acked = value[severity].acknowledged_count;
                cssclass = (total===acked) ? 'acked-events' : '';
                result = iconTemplate.apply({
                    severity: severity,
                    total: total,
                    acked: acked,
                    cssclass: cssclass
                });
            }
        });
        return rainbowTemplate.apply({cells: result});
    },

    locking: function(obj) {
        /*
        * Expects an object with keys updates, deletion, events, all boolean
        */
        var from = [];
        if (obj.updates) {
            from.push('updates');
        }
        if (obj.deletion) {
            from.push('deletion');
        }
        if (!Ext.isEmpty(from)) {
            var l = _t('Locked from ') + from.join(_t(' and '));
            if (obj.events) {
                l += "<br/>"+_t("Send event when blocked");
            } else {
                l += "<br/>"+_t("Do not send event when blocked");
            }
            return l;
        } else {
            return _t('Unlocked');
        }
    },

    locking_icons: function(obj) {
        /*
        * Expects an object with keys updates, deletion, events, all boolean
        * Returns images representing locking status.
        */
        var tpl = new Ext.Template(
            '<img border="0" src="locked-{str}-icon.png"',
            'style="vertical-align:middle"/>'),
            result = '';
        tpl.compile();
        if (obj.updates) {
            result += tpl.apply({str:'update'});
        }
        if (obj.deletion) {
            result += tpl.apply({str:'delete'});
        }
        if (obj.events) {
            result += tpl.apply({str:'sendevent'});
        }
        return result;
    },

    /*
     * Given a uid, determines the type of the object and passes rendering
     * off to the appropriate rendering function.
     * e.g. Zenoss.render.link('/zport/dmd/Devices/Server') =>
     * <a href="/zport/dmd/itinfrastructure#devices:/Devices/Server/Linux">...
     *
     * Can also just accept a url and name for wrapping in an anchor tag, by
     * passing in null for the first argument.
     */
    link: function(uid, url, name) {
        if (!url) {
            var dflt = 'default_uid_renderer',
                type = Zenoss.types.type(uid) || dflt,
                renderer = Zenoss.render[type];
            if (renderer) {
                return renderer(uid, name);
            }
        }
        if (url && name) {
            return '<a class="z-entity" href="'+url+'">'+Ext.htmlEncode(name)+'</a>';
        }
    },

    default_uid_renderer: function(uid, name) {
        // Just straight up links to the object.
        var parts;
        if (!uid) {
            return uid;
        }
        if (Ext.isObject(uid)) {
            name = uid.name;
            uid = uid.uid;
        }
        if (!name) {
            parts = uid.split('/');
            name = parts[parts.length-1];
        }
        return Zenoss.render.link(null, uid, name);
    },

    linkFromGrid: function(value, metaData, record) {

        var item;
        if (typeof(value == 'object')) {
            item = value;
            if(item == null){
                return value;
            }else if(item.url != null) {
                return Zenoss.render.link(null, item.url, item.text);
            }else if(item.uid) {
                return Zenoss.render.link(item.uid, null, item.text);
            }
            return Ext.htmlEncode(item.text);
        }
        return Ext.htmlEncode(value);
    },

    LinkFromGridGuidGroup: function(name, col, record) {
        if (!name) {
            return name;
        }

        var url, results = [];
        Ext.each(name, function(item){
            url = "/zport/dmd/goto?guid=" + item.uuid;
            results.push(Zenoss.render.link(null, url, item.name));
        });

        return results.join(" | ");
    },

    LinkFromGridUidGroup: function(name, col, record) {
        if (!name) {
            return name;
        }

        var url, results = [];
        Ext.each(name, function(item) {
            results.push(Zenoss.render.default_uid_renderer(item.uid, item.name));
        });

        return results.join(" | ");
    },

    Device: function(uid, name) {
        // For now, link to the old device page
        return Zenoss.render.link(null, uid+'/devicedetail#deviceDetailNav:device_overview', name);
    },

    DeviceClass: function(uid, name) {
        var value = uid.replace(/^\/zport\/dmd\/Devices/, '');
        value = value.replace(/\/devices\/.*$/, '');
        var url = '/zport/dmd/itinfrastructure#devices:.zport.dmd.Devices' + value.replace(/\//g,'.');
        if (!Ext.isString(name)) name = value;
        return Zenoss.render.link(null, url, name);
    },

    DeviceLocation: function(uid, name) {
        var value = uid.replace(/^\/zport\/dmd\/Locations/, '');
        value = value.replace(/\/devices\/.*$/, '');
        var url = '/zport/dmd/itinfrastructure#locs:.zport.dmd.Locations' + value.replace(/\//g,'.');
        if (!Ext.isString(name)) name = value;
        return Zenoss.render.link(null, url, name);
    },

    DeviceGroup: function(uid, name) {
        var value = uid.replace(/^\/zport\/dmd\/Groups/, '');
        value = value.replace(/\/devices\/.*$/, '');
        var url = '/zport/dmd/itinfrastructure#groups:.zport.dmd.Groups' + value.replace(/\//g,'.');
        if (!Ext.isString(name)) name = value;
        return Zenoss.render.link(null, url, name);
    },
    DeviceSystem: function(uid, name) {
        var value = uid.replace(/^\/zport\/dmd\/Systems/, '');
        value = value.replace(/\/devices\/.*$/, '');
        var url = '/zport/dmd/itinfrastructure#systems:.zport.dmd.Systems' + value.replace(/\//g,'.');
        if (!Ext.isString(name)) name = value;
        return Zenoss.render.link(null, url, name);
    },

    DeviceComponent: function(name, col, record) {
        var item = record.data[col.id];
        if (item.uid){
            // TODO once these pages are built fix the link
            return Zenoss.render.default_uid_renderer(item.uid, item.text);
        }
        return item.text;
    },

    EventClass: function(uid, name) {
        return Zenoss.render.default_uid_renderer(uid, name);
    },

    IpServiceClass: function(value, metadata, record, rowIndex, colIndex, store) {
        // this is intended to set directly as a column renderer instead of
        // using Types.js. See the Ext.grid.ColumnModel.setRenderer
        // documentation
        var uid = record.data.serviceClassUid.replace(/\//g, '.');
        return Zenoss.render.serviceClass('ipservice', uid, value);
    },

    WinServiceClass: function(value, metadata, record, rowIndex, colIndex, store) {
        // this is intended to set directly as a column renderer instead of
        // using Types.js. See the Ext.grid.ColumnModel.setRenderer
        // documentation
        var uid = record.data.serviceClassUid.replace(/\//g, '.');
        return Zenoss.render.serviceClass('winservice', uid, value);
    },

    serviceClass: function(page, uid, name) {
        var url = Ext.String.format('/zport/dmd/{0}#navTree:{1}', page, uid);
        return Zenoss.render.link(null, url, name);
    },

    nextHop: function(value, metadata, record, rowIndex, colIndex, store) {
        var link = "";
        if (value && value.uid && value.id) {
            link += Zenoss.render.IpAddress(value.uid, value.id);
            if (value.device && value.device.uid && value.device.id) {
                link += " (";
                link += Zenoss.render.Device(value.device.uid, value.device.id);
                link += ")";
            }
        }
        return link;
    },

    IpInterface: function(uid, name) {
        var deviceUid = uid.split('/os/interfaces/')[0];
        var url = deviceUid + '/devicedetail#deviceDetailNav:IpInterface:' + uid;
        return Zenoss.render.link(null, url, name);
    },

    IpAddress: function(uid, name) {
        return Zenoss.render.Network(uid, name);
    },

    Network: function(uid, name) {
        var url = '/zport/dmd/networks#networks:' + uid.replace(/\//g, '.');
        if (!name) {
            var parts = uid.split('/');
            name = parts[parts.length-1];
        }
        return Zenoss.render.link(null, url, name);
    },

    Process: function(uid, name) {
        var url = '/zport/dmd/process#processTree:' + uid.replace(/\//g, '.');
        if (!name) {
            var parts = uid.split('/');
            name = parts[parts.length-1];
        }
        return Zenoss.render.link(null, url, name);
    },
    eventSummaryRow:function (data, metadata, record, rowIndex, columnIndex, store){
        var msg = record.data.message;
        if (!msg || msg == "None" ) {
            msg = record.data.summary;
        }
        msg = Ext.htmlEncode(msg);
        msg = "<pre style='white-space:normal;'>" + msg + "</pre>";
        msg = msg.replace(/\"/g, '&quot;');
        metadata.attr = 'ext:qtip="' + msg + '" ext:qwidth="500"';
        data = Ext.htmlEncode(data);
        return data;
    }


}); // Ext.apply

})(); // End local namespace
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


(function () {
Ext.ns('Zenoss');

Ext.define("Zenoss.FlexButton", {
    extend: "Ext.button.Button",
    alias: ['widget.FlexButton'],
    constructor: function(config) {
        if ( config.menu && config.menu.items && config.menu.items.length == 1 ) {
            // Only has one menu item, lets just not have it display a menu
            config.originalMenu = Ext.apply({}, config.menu);

            // probably don't want to inherit the text
            var menuConfig = config.menu.items[0];
            Ext.apply(config, {listeners: menuConfig.listeners});
            Ext.destroyMembers(config, 'menu');
        }

        Zenoss.FlexButton.superclass.constructor.call(this, config);
    },
    add: function(config) {
        if ( !this.menu ) {
            // this button does not have a menu yet so we need to initialize it
            // update the config with things that may have changed since creation
            var menuConfig = {};
            if ( this.initialConfig.originalMenu ) {
                // originally had a menu, just use it
                Ext.apply(menuConfig, this.initialConfig.originalMenu);

            }
            else {
                // Have to generate a menu config from the original button
                menuConfig.items = [{
                    text: this.getText() ? this.getText() : this.tooltip,
                    listeners: this.initialConfig.listeners
                }];

            }

            this.split = true;
            // remove the old click handler
            var oldClick = this.initialConfig.listeners.click;
            this.un('click', oldClick);

            // Clear out properties that should be handled by the menu item
            this.on('render', function() {
                this.events['click'].clearListeners();
            }); // *TODO* This code makes me feel dirty; there must be a better way
            this.clearTip();

            this.menu = Ext.menu.MenuMgr.get(menuConfig);
            this.up('panel').doLayout();
        }

        return this.menu.add(config);
    }
});

})();
(function(){

Ext.ns('Zenoss', 'Zenoss.i18n');

// Provide a default; this gets filled in later when appropriate.
Zenoss.i18n._data = Zenoss.i18n._data || {};

Zenoss.i18n.translate = function(s, d) {
    var t = Zenoss.i18n._data[s];
    return t ? t : (d ? d: s);
};

// Shortcut
window._t = Zenoss.i18n.translate;
 
})();
/*
 * Tooltips.js
 */
(function(){ // Local scope
/*
 * Zenoss.registerTooltip
 *
 * Make QuickTips also accept a target component or component ID to attach a
 * tooltip to. It will attempt to discover the correct Ext.Element to which it
 * should attach the tip.
 *
 * Accepts the same config options as the Ext.ToolTip constructor.
 *
 */

Zenoss.TIPS = {};

/*
* Zenoss.ToolTip
* Causes tooltips to remain visible if the mouse is over the tip itself,
* instead of hiding as soon as the mouse has left the target.
*/
Zenoss.ToolTip = Ext.extend(Ext.ToolTip, {
   constructor: function(config) {
       Zenoss.ToolTip.superclass.constructor.call(this, config);
       this.on('render', this.attachHoverEvents, this);
   },
   attachHoverEvents: function() {
       var el = this.getEl();
       el.on('mouseenter', this.onMouseEnter, this);
       el.on('mouseleave', this.onTargetOut, this);
   },
   onMouseEnter: function(e) {
       this.clearTimer('hide');
   }
});

Zenoss.registerTooltip = function(config) {
    var t, target = config.target,
        initialConfig = Ext.apply({}, config),
        cmp = Ext.getCmp(target);
    if (typeof(cmp)!="undefined") {
        cmp.on('destroy', function(){
            Zenoss.TIPS[target] = initialConfig;
        });
        if (cmp.btnEl) {
            config.target = cmp.btnEl;
        }
    } else {
        Ext.ComponentMgr.onAvailable(target, function(t){
            t.tooltip = config;
        });
    }
    if ((t=Ext.get(target))) {
        var tip = new Zenoss.ToolTip(config);
        Zenoss.TIPS[target] = tip;
    } else {
        Zenoss.TIPS[target] = initialConfig;
    }
}; // Zenoss.registerTooltip

/*
 * Zenoss.registerTooltipFor
 * 
 * Looks up any tooltips for a component id and registers them. Used for items
 * that don't exist when Zenoss.registerTooltip was called.
 *
 * If a tooltip is already registered, don't reregister it.
 *
 */
Zenoss.registerTooltipFor = function(target) {
    var t;
    if (Ext.isDefined(t = Zenoss.TIPS[target])) {
        if (!(t instanceof Ext.ToolTip)) {
            Zenoss.registerTooltip(t);
        }
    }
}; // Zenoss.registerTooltipFor


})(); // End local scope
(function(){
    Ext.ns('Zenoss.VTypes');

    var ip_regex = new RegExp("^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$");
    var ip_with_netmask_regex = new RegExp("^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(/[0-9]+)$");
    var hex_regex = new RegExp("^#?([a-f]|[A-F]|[0-9]){3}(([a-f]|[A-F]|[0-9]){3,5})?$");
    var numcmp_regex = new RegExp("^(\>=|\<=|\>|\<|=)?\s*([0-9]+)$");
    var numrange_regex = new RegExp("^(-?[0-9]+)?:?(-?[0-9]+)?$");
    var range_regex = new RegExp("^([^:]*):?([^:]*)$");
    var alpha_num_space = new RegExp(/[a-z_\s\d]/i);
    var hostname_or_ip_regex = new RegExp(/[a-zA-Z0-9-_.\(\)\/:]/);

    /**
     * These are the custom validators defined for
     * our zenoss forms. The xtype/vtype custom is to have the
     * name of the vtype all lower case with no word separator.
     *
     **/
    var vtypes = {
        /**
         * Allows int comparisons like 4,>2,<=5
         */
        numcmp: function(val, field) {
            return numcmp_regex.test(val);
        },
        numcmpText: _t('Enter a valid comparison (ex: 4, <2, >=1)'),

        numrange: function(val, field) {
            var result, from, to;
            result = numrange_regex.exec(val);
            if (!result) {
                return false;
            }
            from = result[1];
            to = result[2];
            if (from && to) {
                return parseInt(from) <= parseInt(to);
            }
            return true;
        },
        numrangeText: _t('Enter a valid numeric range (ex: 2, 5:, 6:8, :9)'),

        floatrange: function(val, field) {
            var result, from, to;
            result = range_regex.exec(val);
            if (!result) {
                return false;
            }
            from = result[1];
            to = result[2];
            if (from && to) {
                from = parseFloat(from);
                to = parseFloat(to);
                return !isNaN(from) && !isNaN(to) && from <= to;
            }
            if (from) {
                return !isNaN(parseFloat(from));
            }
            if (to) {
                return !isNaN(parseFloat(to));
            }
            return true;
        },
        floatrangeText: _t('Enter a valid floating point range (ex: 1, 2.5:5.5, 2.5:, :9.5'),

        /**
         * The number must be greater than zero. Designed for us in NumberFields
         **/
        positive: function(val, field) {
            return (val >= 0);
        },
        positiveText: _t('Must be greater than or equal to 0'),

        /**
         * Between 0 and 1 (for float types)
         **/
        betweenzeroandone: function(val, field) {
            return (val >= 0 && val <=1);
        },
        betweenzeroandoneText: _t('Must be between 0 and 1'),
        ipaddress: function(val, field) {
            return ip_regex.test(val);
        },
        ipaddressText: _t('Invalid IP address'),

        ipaddresswithnetmask: function(val, field) {
            return ip_with_netmask_regex.test(val);
        },
        ipaddresswithnetmaskText: _t('You must enter a valid IP address with netmask.'),

        /**
         * Hex Number (for colors etc)
         **/
        hexnumber: function(val, field) {
            return hex_regex.test(val);
        },
        hexnumberText: _t('Must be a 6 or 8 digit hexadecimal value.'),

        /**
         * Modifies alpha number to allow spaces
         **/
        alphanumspace: function(val, field) {
            return alpha_num_space.test(val);
        },
        alphanumspaceText: _t('Must be an alphanumeric value or a space '),
        alphanumspaceMask: alpha_num_space,

        hostnameorIP: function(val, field) {
            return hostname_or_ip_regex.test(val);
        },
        hostnameorIPText: _t('Must be a valid hostname or IP address '),
        hostnameorIPMask: hostname_or_ip_regex
    };

    Ext.apply(Ext.form.VTypes, vtypes);
}());

/*
 * Utility for keeping track of navigation among subcomponents on a page and
 * restoring that state on page load.
 */
Ext.onReady(function(){

    var H = Ext.util.History;
    H.DELIMITER = ':';
    H.selectByToken = function(token) {
        if(token) {
            var parts = token.split(H.DELIMITER),
            mgr = Ext.getCmp(parts[0]),
            remainder = parts.slice(1).join(H.DELIMITER);
            if (mgr) {
                mgr.selectByToken(remainder);
            }
        }
    };
    H.events = H.events || {};
    H.addListener('change', H.selectByToken);

});
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2009, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


(function(){

Ext.define("Zenoss.DisplayField", {
    extend: "Ext.form.DisplayField",
    alias: ['widget.displayfield'],
    constructor: function(config) {
        Ext.applyIf(config, {
            fieldClass: 'display-field'
        });
        Zenoss.DisplayField.superclass.constructor.call(this, config);
    },
    setRawValue: function(v) {
        if (v && Ext.isIE && typeof v === 'string') {
            v = v.replace(/\n/g, '<br/>');
        }
        Zenoss.DisplayField.superclass.setRawValue.call(this, v);
    }
});

Ext.define("Zenoss.EditorWithButtons", {
    extend: "Ext.Editor",
    alias: ['widget.btneditor'],
    onRender: function(ct, position) {
        Zenoss.EditorWithButtons.superclass.onRender.apply(this, arguments);
        this.editorpanel = new Ext.Panel({
            frame: true,
            bodyStyle: Ext.isIE ? 'padding-bottom:5px' : '',
            buttonAlign: 'left',
            buttons: [{
                text:_t('Save'),
                handler: Ext.bind(this.completeEdit, this)
            }, {
                text:_t('Cancel'),
                handler: Ext.bind(this.cancelEdit, this)
            }],
            items: this.field
        });
        if (Ext.isIE) {
            // IE can't set the layer width properly; always gets set to 11189
            this.el.setWidth(450);
        }
        this.editorpanel.render(this.el).show();
    },
    onBlur: function(){
        // do nothing
    }
});

Ext.define("Zenoss.EditableField", {
    extend: "Zenoss.DisplayField",
    alias: ['widget.editable'],
    constructor: function(config) {
        config = Ext.applyIf(config||{}, {
            cls: 'editable-field',
            overCls: 'editable-field-over',
            editEvent: 'click'
        });
        config.editor = Ext.applyIf(config.editor||{}, {
            xtype: 'btneditor',
            updateEl: !Ext.isIE,
            ignoreNoChange: true,
            autoSize: 'width',
            field: {
                xtype: 'textfield',
                selectOnFocus: true
            }
        });
        Zenoss.EditableField.superclass.constructor.call(this, config);
        this.initEditor();
        this.on('render', function(){
            this.getEl().on(this.editEvent, this.startEdit, this);
        }, this);
    },
    initEditor: function() {
        if (!(this.editor instanceof Ext.Editor)) {
            this.editor = Ext.create(this.editor);
        }
        var ed = this.editor;
        ed.on('beforecomplete', this.onBeforeComplete, this);
        if (Ext.isIE) {
            ed.field.origSetValue = ed.field.setValue;
            ed.field.setValue = Ext.bind(function(v){
                v = v.replace(/\<BR\>/g, '\n');
                return this.origSetValue(v);
            }, ed.field);
        }
    },
    getForm: function() {
        var ownerCt = this.ownerCt;
        while (ownerCt && !(ownerCt instanceof Ext.FormPanel)) {
            ownerCt = ownerCt.ownerCt;
        }
        return ownerCt;
    },
    onBeforeComplete: function(t, val, startVal) {
        var opts = Ext.apply({}, this.getForm().baseParams||{});
        opts[this.name] = val;
        this.getForm().api.submit(opts, function(result) {
            if (result.success) {
                this.setValue(result[this.name] || val);
            } else {
                this.setValue(startVal);
            }
        }, this);
    },
    startEdit: function(e, t) {
        if (!this.disabled) {
            this.editor.startEdit(t);
        }
    }
});


Ext.define("Zenoss.EditableTextarea", {
    extend: "Zenoss.EditableField",
    alias: ['widget.editabletextarea'],
    constructor: function(config) {
        config.editor = config.editor || {};
        config.editor.field = Ext.applyIf(config.editor.field||{}, {
            xtype: 'textarea',
            grow: true
        });
        Zenoss.EditableTextarea.superclass.constructor.call(this, config);
    }
});

})();
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


/* package level */
(function() {

Ext.ns('Zenoss.form');

Ext.define("Zenoss.form.FieldRow", {

    alias: ['widget.fieldrow'],
    extend: "Ext.Container",
    constructor: function(config) {
         Ext.apply(config, {
             layout: 'hbox',
             align: 'top'
         });

         var items = config.items;
         config.items = [];

         Ext.each(items, function(item) {
             var cfg = {
                xtype: 'container',
                autoHeight: true,
                minWidth: 10,
                width: item.width,
                fieldDefaults: {
                    labelAlign: item.labelAlign || 'top'
                },
                layout: 'anchor',
                items: [item]
             };
             if (!item.width) {
                 cfg.flex = item.flex || 1;
             }
             config.items.push(cfg);
         });

         Zenoss.form.FieldRow.superclass.constructor.call(this, config);

     }
 });

})();
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


(function() {

Ext.ns('Zenoss.form');

Ext.define("Zenoss.form.InheritField", {
    extend: "Zenoss.form.FieldRow",
    alias: ['widget.inheritfield'],
    constructor: function(config) {
        var item;

        // Take the first member of items
        if (Ext.isObject(config.items)) {
            item = config.items;
        } else {
            item = config.items[0];
        }

        // Add the checkbox
        this.inheritbox = new Ext.form.Checkbox({
            fieldLabel: _t('Inherit?'),
            width: 60
        });
        config.items = [this.inheritbox, item];
        Zenoss.form.InheritField.superclass.constructor.call(this, config);
        this.field = this.items.items[1].items.items[0];
    },
    inherit: function() {
        return this.inheritbox.checked;
    },
    getValue: function() {
        return {
            inherited: this.inherit(),
            value: this.field.getValue()
        };
    },
    setValue: function(value) {
        if (Ext.isObject(value)) {
            this.inheritbox.setValue(
                Ext.isDefined(value.inherited) ? value.inherited : false
            );
            value = value.value;
        } else {
            this.inheritbox.setValue(false);
        }
        this.field.setValue(value);
    }
 });


})();
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


/*
A widget that handles the fact that zProperties can be acquired from parents
in the dmd object hierarchy. The strategy is to use a field set. The title of
the field set is a friendly name for the zProperty (not the z* name). Inside
the field set are two lines. The user selects a line as being the active
setting by clicking on the radio button at the beginning of the row. The top
line has a label that reads 'Set Local Value:', and an appropriate widget for
the type of the zProp (checkbox, textfield, numberfield, or combobox). The 2nd
line states 'Inherit Value' and then indicates the acquired value and the path
of the ancestor from which the value is acquired.

Example usage:

var zMonitor = Ext.create({
    xtype: 'zprop',
    name: 'zMonitor',
    title: _t('Is Monitoring Enabled?'),
    localField: {
        xtype: 'select',
        model: 'local',
        store: [[true, 'Yes'], [false, 'No']],
        value: true
    }
});

zMonitor.setValues({
    isAcquired: false,
    localValue: false,
    acquiredValue: 'No',
    ancestor: '/Processes/Apache'
});

*/

(function() {

Ext.ns('Zenoss.form');


/* A radio button that allows for the boxLabel to be updated.
 */
Ext.define("Zenoss.form.Radio", {
    extend: "Ext.form.Radio",
    alias: ['widget.zradio'],

    setBoxLabel: function(boxLabel) {
        if (this.rendered) {
            this.boxLabel = boxLabel;
            this.boxLabelEl.update(boxLabel);
        } else {
            this.boxLabel = boxLabel;
        }
    }

});

/* A hidden field used internally by the ZProperty fieldset. This hidden field
   overrides getValue to return an object with isAcquired and localValue.
   Introduces the zpropFieldSet config prop which is a reference to the
   ZProperty field set.
 */
Ext.define("Zenoss.form.ZPropHidden", {
    extend: "Ext.form.Hidden",
    alias: ['widget.zprophidden'],

    getValue: function() {
        return {
            isAcquired: this.zpropFieldSet.acquiredRadio.getValue(),
            localValue: this.zpropFieldSet.localField.getValue(),

            // acquiredValue and ancestor aren't needed by the server, but it
            // is needed by reset which is called when the form is submitted
            acquiredValue: this.zpropFieldSet.acquiredValue,
            ancestor: this.zpropFieldSet.ancestor
        };
    },
    getRawValue: function() {
        return this.getValue();
    },
    setValue: function(values) {
        this.zpropFieldSet.setValues(values);
    },

    isDirty: function() {
        return this.zpropFieldSet.acquiredRadio.isDirty() || this.zpropFieldSet.localField.isDirty();
    }

});




/*
A field set that represents a zProperty.

The config parameter passed into the constructor must have a ref. The refOwner
must be the FormPanel.

Additional config keys:
    localField - config for the Ext.form.Field used to input a local setting
    name - string that that is submited to the server as the name

New public method:
    setValues - upon context change in the client code, set all the values
                of this composite widget
 */
Ext.define("Zenoss.form.ZProperty", {
    extend: "Ext.form.FieldSet",
    alias: ['widget.zprop'],

    constructor: function(config) {
        Ext.applyIf(config, {
            hideLabels: true,
            hideBorders: true,
            border:false,
            defaults:{border:false},
            items: [
                this.getLocalRadioConfig(config.localField),
                this.getAcquiredRadioConfig(),
                this.getHiddenFieldConfig(config.name)
            ]
        });
        Zenoss.form.ZProperty.superclass.constructor.call(this, config);
    },
    setValues: function(values) {
        // values has isAcquired, localValue, acquiredValue, and ancestor
        // localValue is the appropriate type
        // acquiredValue is always a string

        // setting the values this away marks the form clean and disables the
        // submit and cancel buttons

        if (!values) {
            return;
        }
        var basicForm = this.refOwner.getForm();
        basicForm.setValues([
            {id: this.localRadio.getName(), value: !values.isAcquired},
            {id: this.localField.getName(), value: values.localValue},
            {id: this.acquiredRadio.getName(), value: values.isAcquired}
        ]);

        // update the boxLabel with the acquiredValue and ancestor
        var boxLabel;
        if ( values.acquiredValue !== null && values.ancestor !== null ) {
            boxLabel = Ext.String.format('Inherit Value "{0}" from {1}', values.acquiredValue, values.ancestor);
            this.acquiredRadio.enable();
        } else {
            boxLabel = Ext.String.format('Inherit Value');
            this.acquiredRadio.disable();
        }
        this.acquiredRadio.setBoxLabel(boxLabel);
        this.acquiredValue = values.acquiredValue;
        this.ancestor = values.ancestor;
    },

    // private
    getHiddenFieldConfig: function(name) {
        return {
            xtype: 'zprophidden',
            name: name,
            zpropFieldSet: this
        };
    },

    // private
    getAcquiredRadioConfig: function() {
        return {
            xtype: 'zradio',
            ref: 'acquiredRadio',
            boxLabel: 'Inherit Value',
            scope: this,
            anchor: '75%',
            handler: function(acquiredRadio, checked) {
                this.localRadio.setValue(!checked);
            }
        };
    },

    //private
    getLocalRadioConfig: function(localField) {
        return {
            xtype: 'panel',
            layout: 'column',
            hideBorders: true,
            border:false,
            defaults: {
                xtype: 'panel',
                layout: 'anchor',
                border:false,
                hideLabels: true
            },
            items: [{
                width: 130,
                items: [{
                    xtype: 'radio',
                    ref: '../../localRadio',
                    boxLabel: _t('Set Local Value:'),
                    checked: true,
                    scope: this,
                    handler: function(localRadio, checked) {
                        this.acquiredRadio.setValue(!checked);
                    }
                }]
            }, {
                columnWidth: 0.94,
                items: [
                    // Set submitValue to false in case localField has a name
                    Ext.apply(localField, {
                        ref: '../../localField',
                        submitValue: false,
                        anchor: '75%',
                        listeners: {
                            scope: this,
                            focus: function() {
                                this.localRadio.setValue(true);
                            }
                        }
                    })
                ]
            }]
        };
    }

});

// A simple ComboBox that behaves like an HTML select tag
Ext.define("Zenoss.form.Select", {
    extend: "Ext.form.ComboBox",
    alias: ['widget.select'],

    constructor: function(config){
        Ext.applyIf(config, {
            allowBlank: false,
            triggerAction: 'all',
            typeAhead: false,
            forceSelection: true
        });
        Zenoss.form.Select.superclass.constructor.call(this, config);
    }

});

})();
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


(function() {

var ZF = Ext.ns('Zenoss.form');

Ext.define("Zenoss.form.IDField", {
    alias: ['widget.idfield'],
    extend: "Ext.form.TextField",
    anchor:'80%',
    /*
    * Context on which to check for id validity. Defaults to
    * Zenoss.env.PARENT_CONTEXT.
    */
    context: null,
    /*
    * Limit characters to those accepted by ObjectManager
    */
    maskRe: /[a-zA-Z0-9-_~,.$\(\)# @]/,
    /*
    * Validator function that makes a request to the parent context and calls
    * the checkValidId method.
    */
    validator: function(value) {
        var context = this.context || Zenoss.env.PARENT_CONTEXT;

        // Don't bother with empty values
        if (Ext.isEmpty(value)) {
            return true;
        }
        // if the value has not changed do not send an ajax request
        if(typeof _previousVar != 'undefined'){
            if (value == _previousValue) {
                return this.reportResponse(_previousResponseText);
            }
        }
        _previousValue = value;

        if (this.vtransaction) {
            Ext.Ajax.abort(this.vtransaction);
        }
        this.vtransaction = Ext.Ajax.request({
            url: context + '/checkValidId?id='+value,
            method: 'GET',
            success: function(response) {
                this._previousResponseText = response.responseText;
                return this.reportResponse(response.responseText);
            },
            failure: function(response) {
                this.markInvalid(
                    _t('That name is invalid or is already in use.')
                );
            },
            scope: this
        });
        return true;
    },
    /**
    * Interprets a response from the server to determine if this field is valid.
    **/
    reportResponse: function(responseText) {
        if (responseText === "True") {
            return true;
        }
        // the server responds with a string of why it is invalid
        this.markInvalid(
            _t('That name is invalid: ') + ' ' + responseText
        );
        return false;
    }
});

})();
/*****************************************************************************
 *
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 *
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 *
 ****************************************************************************/


(function(){

Ext.ns('Zenoss', 'Zenoss.dialog');

/**
 * @class Zenoss.dialog.BaseWindow
 * @extends Ext.window.Window
 * A modal window with some defaults. Will auto focus on the first
 * textfield and make the enter key hit submit
 *
 **/
Ext.define("Zenoss.dialog.BaseWindow", {
    extend: "Ext.window.Window",
    alias: ['widget.basewindow'],
    constructor: function(config) {
        config = config || {};
        Ext.applyIf(config, {
            //layout: (Ext.isIE) ? 'form': 'fit',
            plain: true,
            buttonAlign: 'left',
            modal: true,
            constrain: true
        });
        Zenoss.dialog.BaseWindow.superclass.constructor.apply(this, arguments);
    },
    initEvents: function() {
        Zenoss.dialog.BaseWindow.superclass.initEvents.apply(this, arguments);
        this.on('show', this.focusFirstTextField, this);
        this.on('show', this.registerEnterKey, this);
    },
    focusFirstTextField: function() {
        // go through our items and find a text field

        var fields = this.query("textfield");
        if (fields.length) {
            fields[0].focus(false, 300);
        }
    },
    registerEnterKey: function() {
        var km = this.getKeyMap();
        km.on(13, function(){
            var button, el;

            // make sure we are not focused on text areas
            if (document.activeElement) {
                el = document.activeElement;
                if (el.type == "textarea" || el.type == 'button') {
                    return;
                }
            }

            // the button is on the window
            var buttons = this.query("button");
            if (buttons && buttons.length) {
                button = buttons[0];
            }else{
                // the button is on a form
                var forms = this.query('form');
                if (forms) {
                    if (forms.length && forms[0]){
                        var form = forms[0];
                        if (form.query("button").length) {
                            button = form.query("button")[0];
                        }
                    }
                }
            }

            if (button && !button.disabled){
                button.handler(button);
            }
        }, this);

    },
    /**
     * Make sure any dialog appears above loadmasks.
     **/
    show: function() {
        var oldSeed = Ext.WindowManager.zseed;
        Ext.WindowManager.zseed = 20000;
        this.callParent(arguments);
        Ext.WindowManager.zseec = oldSeed;
    }

});



/**
 * @class Zenoss.dialog.BaseDialog
 * @extends Zenoss.dialog.BaseWindow
 * A modal dialog with Zenoss styling. Subclasses should specify a layout.
 * @constructor
 */
Ext.define("Zenoss.dialog.BaseDialog", {
    extend: "Zenoss.dialog.BaseWindow",
    constructor: function(config) {
        Ext.applyIf(config, {
            width: 310,
            closeAction: 'hide',
            buttonAlign: 'left',
            padding: 10,
            autoHeight: true
        });
        this.callParent([config]);
    }
});

function destroyWindow(button) {
    var win = button.up('window');
    if (win){
        return win.destroy();
    }
    if (button.ownerCt !== undefined){
        var container = button.ownerCt.ownerCt;
        if (container.ownerCt !== undefined){
            container.ownerCt.destroy();
        }else{
            container.destroy();
        }
    }
}

/**
 * @class Zenoss.dialog.HideDialogButton
 * @extends Ext.Button
 * A button that destroys its window.
 * @constructor
 */
Ext.define("Zenoss.dialog.DialogButton", {
    ui: 'dialog-dark',
    extend: "Ext.button.Button",
    alias: ['widget.DialogButton'],
    constructor: function(config) {
        var h = config.handler;
        config.handler = h ? Ext.Function.createSequence(h, destroyWindow) : destroyWindow;
        Zenoss.dialog.DialogButton.superclass.constructor.call(this, config);
    },
    setHandler: function(handler, scope) {
        var h = handler ? Ext.Function.createSequence(handler, destroyWindow) : destroyWindow;
        Zenoss.dialog.DialogButton.superclass.setHandler.call(this, h, scope);
    }
});



function hideWindow(button){
    button.ownerCt.ownerCt.hide();
}

/**
 * @class Zenoss.dialog.HideDialogButton
 * @extends Ext.Button
 * A button that hides it's window.
 * @constructor
 */
Ext.define("Zenoss.dialog.HideDialogButton", {
    ui: 'dialog-dark',
    extend: "Ext.button.Button",
    alias: ['widget.HideDialogButton'],
    constructor: function(config) {
        var h = config.handler;
        config.handler = h ? Ext.Function.createSequence(h, hideWindow) : hideWindow;
        Zenoss.dialog.HideDialogButton.superclass.constructor.call(this, config);
    },
    setHandler: function(handler, scope) {
        var h = handler ? Ext.Function.createSequence(handler, hideWindow) : hideWindow;
        Zenoss.dialog.HideDialogButton.superclass.setHandler.call(this, h, scope);
    }

});



Zenoss.dialog.CANCEL = {
    xtype: 'DialogButton',
    text: _t('Cancel')
};

/**
 * @class Zenoss.MessageDialog
 * @extends Zenoss.dialog.BaseDialog
 * A modal dialog window with Zenoss styling and a fit layout.  This window
 * meant to be instantiated once per page, and hidden each time the user
 * closes it.  Includes an OK and Cancel button.
 * @constructor
 */
Ext.define("Zenoss.MessageDialog", {
    extend: "Zenoss.dialog.BaseDialog",
    constructor: function(config) {
        Ext.applyIf(config, {
            layout: 'fit',
            items: [ {
                xtype: 'label',
                text: config.message,
                ref: 'messagelabel'
                } ],
            buttons: [
                {
                    xtype: 'HideDialogButton',
                    text: _t('OK'),
                    handler: config.okHandler
                }, {
                    xtype: 'HideDialogButton',
                    text: _t('Cancel'),
                    handler: config.cancelHandler
                }
            ]
        });
        Zenoss.MessageDialog.superclass.constructor.call(this, config);
    },
    setText: function(text) {
        this.messagelabel.setText(text);
    }
});

/**
 * @class Zenoss.dialog.SimpleMessageDialog
 * @extends Zenoss.dialog.BaseDialog
 * A modal dialog window with Zenoss styling and a fit layout. No buttons are
 * included
 * @constructor
 */
Ext.define("Zenoss.dialog.SimpleMessageDialog", {
    extend: "Zenoss.dialog.BaseDialog",
    /**
     * message to be displayed on dialog
     * @param {Object} config
     */
    message: null,
    constructor: function(config) {
        Ext.applyIf(config, {
            layout: 'anchor',
            items: [{
                html: config.message
            },{
                // add a spacer between the text and the buttons so it is not squished together
                height: 10
            }],
            closeAction: 'destroy'
        });
        Zenoss.MessageDialog.superclass.constructor.call(this, config);
    }
});

/**
 * @class Zenoss.FormDialog
 * @extends Zenoss.dialog.BaseWindow
 * A modal dialog window with Zenoss styling and a form layout.  This window
 * meant to be instantiated multiple times per page, and destroyed each time
 * the user closes it.
 * @constructor
 */
Ext.define("Zenoss.FormDialog", {
    extend: "Zenoss.dialog.BaseWindow",
    constructor: function(config) {
        var me = this;
        config = config || {};
        config.formListeners = config.formListeners || {};
        Ext.applyIf(config.formListeners, {
            validitychange: function(form, isValid) {
                me.query('DialogButton')[0].setDisabled(!isValid);
            }
        });
        var form = new Ext.form.FormPanel({
            id: config.formId,
            minWidth: 300,
            ref: 'editForm',
            fieldDefaults: {
                labelAlign: 'top'
            },
            autoScroll: true,
            defaults: {
                xtype: 'textfield'
            },
            items: config.items,
            html: config.html,
            listeners: config.formListeners,
            paramsAsHash: true,
            api: config.formApi || {}
        });

        // Remove config properties that don't pertain to the window
        Ext.destroyMembers(config, 'items', 'formApi', 'formId', 'html');

        Ext.applyIf(config, {
            // ie renders window correctly on when layout is set to form
            // this may change in future ext/ie version
            //layout: (Ext.isIE) ? 'form': 'fit',
            plain: true,
            buttonAlign: 'left',
            autoScroll: true,
            width: 375,
            modal: true,
            padding: 10
        });

        Zenoss.FormDialog.superclass.constructor.call(this, config);

        this.add(form);
        this.form = form;
    },

    getForm: function() {
        return this.form;
    }
});


Ext.define("Zenoss.dialog.CloseDialog",{
    extend: "Zenoss.dialog.BaseWindow",
    constructor: function(config) {
        Ext.applyIf(config, {
            width: 310,
            plain: true,
            layout: 'auto',
            buttonAlign: 'left',
            padding: 10,
            modal: true
        });
        Zenoss.dialog.CloseDialog.superclass.constructor.call(this, config);
    }
});


/**
 * @class Zenoss.HideFormDialog
 * @extends Zenoss.dialog.BaseDialog
 * A modal dialog window with Zenoss styling and a form layout.  This window
 * meant to be instantiated once per page, and hidden each time the user
 * closes it.
 * @constructor
 */
Ext.define("Zenoss.HideFormDialog", {
    extend: "Zenoss.dialog.BaseDialog",
    constructor: function(config) {
        Ext.applyIf(config, {
            layout: 'anchor',
            fieldDefaults: {
                labelAlign: 'top'
            }
        });
        Zenoss.HideFormDialog.superclass.constructor.call(this, config);
    }
});

/**
 * @class Zenoss.SmartFormDialog
 * @extends Zenoss.FormDialog
 * A modal dialog window with Zenoss styling and a form layout.  This window
 * meant to be instantiated once and then thrown away after use.
 *
 * It smartly cleans up it's own form items when "hidden" and provides a better
 * handler mechanism for the callback, returning an object with properties of
 * all form values.
 * @constructor
 */
Ext.define("Zenoss.SmartFormDialog", {
    extend: "Zenoss.FormDialog",
    alias: 'widget.smartformdialog',
    message: '',
    submitHandler: null,
    constructor: function(config) {
        var me = this;
        this.listeners = config.listeners;
        Ext.applyIf(this.listeners, {
            validitychange: function(form, isValid) {
                var btn = me.query("button[ref='buttonSubmit']")[0];
                btn.setDisabled(!isValid);
            }
        });
        Ext.applyIf(config, {
            buttons: [{
                xtype: 'DialogButton',
                text: _t('Submit'),
                disabled: true,
                type: 'submit',
                ref: 'buttonSubmit'
             }, {
                xtype: 'DialogButton',
                ref: 'buttonCancel',
                text: _t('Cancel')
            }],
            modal: true,
            closeAction: 'destroy'
        });

        Zenoss.SmartFormDialog.superclass.constructor.call(this, config);

        if ( config.message || this.message ) {
            this.insert(0, {
                xtype: 'label',
                ref: 'label',
                text: config.message || this.message
            });
        }
    },
    setSubmitHandler: function(callbackFunction) {
        var btn = this.query("button[ref='buttonSubmit']")[0];

        if (callbackFunction === null) {
            btn.setHandler(null);
        }
        else {
            btn.setHandler(Ext.bind(function() {
                var form = this.getForm();
                var values = form.getValues();
                return callbackFunction(values);
            }, this));
        }
    },
    initComponent: function() {
        this.callParent();
        if (this.submitHandler) {
            this.setSubmitHandler(this.submitHandler);
            delete this.submitHandler;
        }
    }
});



/**
 * @class Zenoss.dialog.ErrorDialog
 * @extends Zenoss.dialog.BaseDialog
 * A modal dialog window with Zenoss styling and a fit layout.
 * @constructor
 */
Ext.define("Zenoss.dialog.ErrorDialog", {
    extend: "Zenoss.dialog.BaseDialog",
    title:_t('Error'),
    message: null,
    constructor: function(config) {
        Ext.applyIf(config, {
            layout: 'fit',
            cls:'errorbox',
            items: [{
                html: config.message,
                buttons: [{
                    xtype: 'DialogButton',
                    text: _t('OK')
                }]
            }],
            closeAction: 'destroy'
        });
         this.callParent([config]);
    },
    initComponent: function(){
        this.callParent(arguments);
        this.show();
    }
});


/**
 * @class Zenoss.HideFitDialog
 * @extends Zenoss.dialog.BaseWindow
 * A modal dialog window with Zenoss styling and a fit layout.
 * @constructor
 */
Ext.define("Zenoss.HideFitDialog", {
    extend: "Zenoss.dialog.BaseWindow",
    constructor: function(config) {
        Ext.applyIf(config, {
            width: 600,
            height: 300,
            closeAction: 'hide',
            plain: true,
            buttonAlign: 'left',
            padding: 10,
            modal: true
        });
        Zenoss.HideFitDialog.superclass.constructor.call(this, config);
    }
});

/**
 * Works in conjunction with Zenoss.dialog.DialogFormPanel. Loads a formPanel
 * with ID diynamic-dialog-panel and submits the form on the panel when the
 * submit button on this dialog is pressed.
 */
Ext.define("Zenoss.dialog.DynamicDialog", {
    extend: "Zenoss.dialog.BaseDialog",
    initEvents: function(){
        Zenoss.dialog.DynamicDialog.superclass.initEvents.call(this);
        this.body.getLoader().on('failure', function(el, response) {
            el.update("Failed to load dialog");
        });
    },
    constructor: function(config) {
        config = Ext.applyIf(config || {}, {
            layout: 'fit',
            modal: true,
            stateful: false,
            closeAction: 'close',
            minHeight: '150',
            buttons: [{
                xtype: 'DialogButton',
                text: _t('Submit'),
                handler: Ext.bind(this.submitHandler, this)
            },{
                xtype: 'DialogButton',
                text: _t('Cancel')
            }]
        });
        Ext.apply(config, {
            id: 'dynamic-dialog'
        });
        Zenoss.dialog.DynamicDialog.superclass.constructor.call(this, config);
    },
    submitHandler: function(b, event){
        var formPanel = Ext.getCmp('dynamic-dialog-panel');
        var form = formPanel.getForm();
        var params = {};
        if (Ext.isDefined(formPanel.submitName) && formPanel.submitName !== null){
            params[formPanel.submitName] = 'OK';
        }
        form.submit({
            params: params,
            success: Ext.bind(function(form, action){
                Zenoss.message.success(_t('{0} finished successfully'), this.title);
            }, this),
            failure: function(form, action){
                Zenoss.message.error(_t('{0} had errors'), this.title);
            }
        });
    }
});

/**
 * Used to create dialogs that will be added dynamically
 */
Ext.define("Zenoss.dialog.DialogFormPanel", {
    extend: "Ext.form.FormPanel",
    alias: ['widget.DialogFormPanel'],
    /**
     * whether or not the result of submitting the form associated with this
     * panel will return a json result. Default true
     */
    jsonResult: true,
    /**
     * extra parameter to send when submitted
     */
    submitName: null,
    /**
     * name of an existing from to be submitted; if not defined a new form
     * will be created.  Primarily used for backwards compatibility so existing
     * dialog forms don't have to be entirely rewritten.
     */
    existingFormId: null,
    constructor: function(config) {
        config = config || {};
        Ext.apply(config, {
            id: 'dynamic-dialog-panel'
        });
        Zenoss.dialog.DialogFormPanel.superclass.constructor.call(this, config);
    },
    /**
     * private; override from base class so that a basic form can be created
     * to point at an existing from if configured and also set a different
     * response reader if expected result from submit is not JSON
     */
    createForm: function(){
        var config = Ext.applyIf({listeners: {}}, this.initialConfig);
        if (!this.jsonResult) {
            config.errorReader = {
                read: function(xhr) {
                    var success = true;
                    //TODO scan result for exceptions/errors
                    if (xhr.status != 200) {
                        success = false;
                    }
                    return {
                        records: [],
                        success: success
                    };
                }
            };
        }
        var formId = null;
        if (this.existingFormId !== null){
            formId = this.existingFormId;
        }
        return new Ext.form.BasicForm(formId, config);
    }
});



})();
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


/* package level */
(function() {
    Ext.namespace('Zenoss.form');
    /**
     * Config Options:
     * - record (required) - the record we are editing, it is attached to each item
     * - items - received from the Schema declaration
     * - directFn - The server call when we press Save
     * - saveHandler - the router callback from after we save
     **/
    Ext.define("Zenoss.form.DataSourceEditDialog", {
        extend: "Zenoss.dialog.BaseWindow",
        alias: ['widget.datasourceeditdialog'],
        constructor: function(config) {
            config = config || {};

            // verify we received the record we are editing
            var record = config.record,
                items = config.items,
                i,
                autoHeight = true,
                that = this; // used in the save handler closure
            this.itemCount = 0;
            // make sure the record was passed in
            if (!record) {
                throw "EditDialog did not recieve a record to edit (config.record is undefined)";
            }

            if (!config.singleColumn) {
                items = this.sortItems(items, record);
            }else{
                // the items come in the form of a single fieldset
                // and we can not have a fieldset because it looks ugly in a dialog
                items = items.items[0].items;
                for(i=0; i<items.length; i+=1) {
                    items[i].record = record;
                    this.itemCount += 1;
                    // datapointitemselectors are tall
                    if (items[i]['xtype'] == 'datapointitemselector') {
                        this.itemCount += 4;
                    }
                }
            }

            // Since ext has no maxheight property, we need to only use autoheight if we don't
            // have a lot of items. Otherwise the dialog expands off the screen.
            if (this.itemCount > 10) {
                autoHeight = false;
            }

            Ext.apply(config, {
                layout: 'anchor',
                plain: true,
                buttonAlign: 'left',
                autoScroll: true,
                constrain: true,
                modal: true,
                padding: 10,
                height: 500,
                autoHeight: autoHeight,
                items: [{
                    xtype:'form',
                    minWidth: 300,
                    ref: 'editForm',
                    fieldDefaults: {
                        labelAlign: 'top'
                    },
                    autoScroll:true,

                    defaults: {
                        xtype: 'textfield',
                        anchor: '85%'
                    },
                    listeners: {
                        /**
                         * Sets the windows submit button to be disabled when the form is not valid
                         **/
                        validitychange: function(formPanel, valid){
                            var dialogWindow = that;
                            // check security first
                            if (Zenoss.Security.hasPermission('Manage DMD')) {
                                dialogWindow.submitButton.setDisabled(!valid);
                            }
                        }
                    },
                    items: items

                }],
                buttons: [{
                    xtype: 'DialogButton',
                    ref: '../submitButton',
                    disabled: Zenoss.Security.doesNotHavePermission('Manage DMD'),
                    text: _t('Save'),
                    handler: function () {
                        var form = that.editForm.form,
                            dirtyOnly = true,
                            values = form.getFieldValues(dirtyOnly);

                        values.uid = record.uid;
                        config.directFn(values, config.saveHandler);
                    }
                },
                    Zenoss.dialog.CANCEL
                ]

            });
            Zenoss.form.DataSourceEditDialog.superclass.constructor.apply(this, arguments);
        },

        /**
         * This function returns a two column layout with the fields auto divided between the
         * column according to the order they are defined.
         * If you specify a group in your datasource schema, they will appear in that "panel" on this dialog
         **/
        sortItems: function(fieldsets, record) {
            var panel = [], i, j, currentPanel,
            item, fieldset, tmp, header, textareas;

            // items comes back from the server in the form
            // fieldsets.items[0] = fieldset
            fieldsets = fieldsets.items;

            // The datasources have a convention to where the first items are
            // ungrouped.
            // This section makes sure the non-titled one is first.
            // (It swaps the titled first fieldset with the untitled fieldset)
            if (fieldsets[0].title) {
                tmp = fieldsets[0];
                for (i=0; i < fieldsets.length; i += 1) {
                    if (!fieldsets[i].title) {
                        fieldsets[0] = fieldsets[i];
                        fieldsets[i] = tmp;
                        break;
                    }
                }
            }

            // this creates a new panel for each group of items that come back from the server
            for (i =0; i < fieldsets.length; i += 1) {
                fieldset = fieldsets[i];

                // format the title a little funny
                if (fieldset.title) {
                    header = {
                        xtype: 'panel',
                        layout: 'anchor',
                        html: '<br /><br /><h1>' + fieldset.title + '</h1>'
                    };
                }else {
                    header = null;
                }

                textareas = [];

                currentPanel = {
                    xtype:'panel',
                    layout: 'column',
                    items: [{
                        layout:'anchor',
                        border:false,
                        columnWidth: 0.5,
                        items: []
                    },{
                        layout:'anchor',
                        border:false,
                        columnWidth: 0.5,
                        items: []
                    }]
                };

                // alternate which column this item belongs too
                for(j = 0; j < fieldset.items.length; j += 1) {
                    item = fieldset.items[j];
                    this.itemCount += 1;
                    item.record = record;

                    // we want to keep text areas to put them in a single column panel
                    if (item.xtype.search(/textarea/) >= 0) {
                        textareas.push(item);
                    }else{
                        currentPanel.items[j%2].items.push(item);
                    }
                }

                // if we have a header set display it
                if (header) {
                    panel.push(header);
                }

                // add the non-textarea fields
                panel.push(currentPanel);

                // put text areas in a single column layout
                if (textareas.length) {
                    for (j=0; j<textareas.length; j += 1) {
                        panel.push({
                            xtype: 'panel',
                            layout: 'anchor',
                            items: textareas[j]
                        });
                    }
                }

            }// fieldsets

            return panel;
        }
    });


}());
(function() {
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2012, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


Ext.ns('Zenoss.model');

    // Common fields used by all tree models
    Zenoss.model.BASE_TREE_FIELDS = [
        {
            name: 'hidden',
            type: 'boolean'
        },
        {
            name: 'leaf',
            type: 'boolean'
        },
        {
            name: 'uid',
            type: 'string'
        },
        {
            name: 'text'
        },
        {
            name: 'id',
            type: 'string'
        },
        {
            name: 'path',
            type: 'string'
        },
        {
            name: 'iconCls',
            type: 'string'
        },
        {
            name: 'uuid',
            type: 'string'
        }
    ];

    // A model defined which uses the default tree fields
    Ext.define("Zenoss.model.Tree", {
        extend: 'Ext.data.Model',
        fields: Zenoss.model.BASE_TREE_FIELDS
    });
}());
(function() {
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2012, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


Ext.ns('Zenoss.model');

    /**
     * Model that defines a uid and name
     **/
    Ext.define("Zenoss.model.Basic", {
        extend: 'Ext.data.Model',
        idProperty: 'uid',
        fields: ['uid', 'name']
    });
    
    /**
     * Model that defines a uid and label
     **/
    Ext.define("Zenoss.model.Label", {
        extend: 'Ext.data.Model',
        idProperty: 'uid',
        fields: ['uid', 'label']
    });    

    /**
     * Like the basic model but defined with the UUID instead of the uid
     **/
    Ext.define("Zenoss.model.BasicUUID", {
        extend: 'Ext.data.Model',
        idProperty: 'uuid',
        fields: ['uuid', 'name']
    });

    /**
     * Store that just defines a name
     **/
    Ext.define("Zenoss.model.Name", {
        extend: 'Ext.data.Model',
        idProperty: 'name',
        fields: ['name']
    });

    Ext.define("Zenoss.model.NameValue", {
        extend: 'Ext.data.Model',
        idProperty: 'value',
        fields: ['name', 'value']
    });

    Ext.define("Zenoss.model.IdName", {
        extend: 'Ext.data.Model',
        idProperty: 'id',
        fields: ['id', 'name']
    });

    Ext.define("Zenoss.model.ValueText", {
        extend: 'Ext.data.Model',
        idProperty: 'value',
        fields: ['value', 'text']
    });

}());
/*****************************************************************************
 *
 * Copyright (C) Zenoss, Inc. 2009, all rights reserved.
 *
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 *
 ****************************************************************************/


(function () {

    Ext.ns('Zenoss');

    /**
     * @class Zenoss.HierarchyTreePanel
     * @extends Ext.tree.TreePanel
     * The primary way of navigating one or more hierarchical structures. A
     * more advanced Subsections Tree Panel. Configurable as a drop target.
     * Accepts array containing one or more trees (as nested arrays). In at
     * least one case data needs to be asynchronous. Used on screens:
     *   Device Classification Setup Screen
     *   Devices
     *   Device
     *   Event Classification
     *   Templates
     *   Manufacturers
     *   Processes
     *   Services
     *   Report List
     * @constructor
     */



    /**
     * The default sort for hierarchical tree panels.
     * Show anything with a folder icon first and then sort Alpha.
     * by the "text" property.
     * To override this pass a custom sort function in the Tree Panel's
     * config.sortFn property.
     **/
    function sortTreeNodes(o1, o2) {
        function getText(object) {
            // text is sometimes an object and sometimes a string
            if (Ext.isObject(object.get('text'))) {
                return object.get('text').text.toLowerCase();
            }
            return object.get('text').toLowerCase();
        }

        function alphcmp(obj1, obj2) {
            var text1 = getText(obj1),
            text2 = getText(obj2);

            // sort by text
            if (text1 == text2) {
                return 0;
            }
            return text1 < text2 ? -1 : 1;
        }


        // always show folders first
        if (o1.get('iconCls') == 'folder' &&  o2.get('iconCls') != 'folder'){
            return -1;
        }
        if (o2.get('iconCls') == 'folder' && o1.get('iconCls') != 'folder') {
            return 1;
        }

        // otherwise sort by text
        return alphcmp(o1, o2);
    }
	
    /**
     * Base Tree Selection model for zenoss. Defines
     * the getSelectedNode method that existed in 3.X trees.
     **/
    Ext.define('Zenoss.TreeSelectionModel', {
        extend:'Ext.selection.TreeModel',
        getSelectedNode:function () {
            var selections = this.getSelection();
            if (selections.length) {
                return selections[0];
            }
            return null;
        }

    });

    Ext.define('Zenoss.HierarchyTreePanelSearch', {
        extend:'Ext.Panel',
        alias:['widget.HierarchyTreePanelSearch'],
        constructor:function (config) {
            var oldConfig = config;
            config = {
                cls:'x-hierarchy-search-panel',
                bodyStyle:'background-color:#d4e0ee;',
                items:[
                    {
                        xtype:'searchfield',
                        id:config.id || Ext.id(),
                        height: 25,
                        hidden:!Zenoss.settings.enableTreeFilters,
                        cls:'x-hierarchy-search',
                        enableKeyEvents:true,
                        ref:'searchfield'
                    },
                    {
                        xtype:'panel',
                        ui:'hierarchy',
                        padding:'5px 0 0 0',
                        items:oldConfig.items,
                        flex:1,
                        autoScroll:true,
                        regSearchListeners:function (listeners) {
                            this.ownerCt.query('.searchfield')[0].on(listeners);
                        }
                    }
                ],
                layout:{
                    type:'vbox',
                    align:'stretch'
                },
                listeners: {
                    afterrender: function(t){
                        // fixes 20000px width bug on the targetEl div bug in Ext
                        t.searchfield.container.setWidth(t.ownerCt.getWidth());
                    }
                }
            };

            Zenoss.HierarchyTreePanelSearch.superclass.constructor.call(this, config);
        }
    });

    /**
     *  Right click handlers for nodes.
     **/
    Zenoss.treeContextMenu = function (view, node, item, index, e, opti) {
        // Register the context node with the menu so that a Menu Item's handler function can access
        // it via its parentMenu property.
        var tree = view.panel;
        if (!tree.contextMenu) {
            tree.contextMenu = new Ext.menu.Menu({
                items:[
                    {
                        ref:'refreshtree',
                        text:_t('Refresh Tree'),
                        handler:function (item, e) {
                            var node = item.parentMenu.contextNode;
                            var tree = item.parentMenu.tree;
                            tree.getStore().load({
                                callback:function () {
                                    tree.getRootNode().expand();
                                    if (tree.getRootNode().childNodes.length) {
                                        tree.getRootNode().childNodes[0].expand();
                                    }
                                }
                            });
                        }
                    },
                    {
                        ref:'expandall',
                        text:_t('Expand All'),
                        handler:function (item, e) {
                            var node = item.parentMenu.contextNode,
                                tree = item.parentMenu.tree;
                            tree.expandAll();
                        }
                    },
                    {
                        ref:'collapsall',
                        text:_t('Collapse All'),
                        handler:function (item, e) {
                            var node = item.parentMenu.contextNode,
                                tree = item.parentMenu.tree;
                            tree.collapseAll();
                            // by default we usually expand the first child
                            tree.getRootNode().expand();
                            if (tree.getRootNode().childNodes.length) {
                                tree.getRootNode().childNodes[0].expand();
                            }
                        }
                    },
                    '-',
                    {
                        ref:'expandnode',
                        text:_t('Expand Node'),
                        handler:function (item, e) {
                            var node = item.parentMenu.contextNode;
                            if (node) {
                                node.expand(true, true);
                            }
                        }
                    },
                    {
                        ref:'newwindow',
                        text:_t('Open in New Window'),
                        handler:function (item, e) {
                            var node = item.parentMenu.contextNode,
                                tree, path,
                                href = window.location.protocol + '//' + window.location.host + window.location.pathname;
                            if (node && node.data.uid) {
                                tree = item.parentMenu.tree;
                                path = tree.createDeepLinkPath(node);
                                window.open(href + '#' + path);
                            }
                        }
                    }
                ]
            });
        }
        var c = tree.contextMenu;
        c.tree = tree;
        c.contextNode = node;
        e.preventDefault();
        c.showAt(e.getXY());
    };


    /**
     * @class Zenoss.HierarchyTreePanel
     * @extends Ext.tree.Panel
     * Base classe for most of the trees that appear on the left hand side
     * of various pages
     **/
    Ext.define('Zenoss.HierarchyTreePanel', {
        extend:'Ext.tree.Panel',
        alias:['widget.HierarchyTreePanel'],
        constructor:function (config) {
            Ext.applyIf(config, {
                enableDragDrop:true
            });
            config.listeners = config.listeners || {};
            Ext.applyIf(config.listeners, {
                itemcontextmenu:Zenoss.treeContextMenu,
                scope:this
            });

            config.viewConfig = config.viewConfig || {};
            if (config.enableDragDrop) {
                Ext.applyIf(config.viewConfig, {
                    loadMask:true,
                    plugins:{
                        ptype:'treeviewdragdrop',
                        enableDrag:Zenoss.Security.hasPermission('Change Device'),
                        enableDrop:Zenoss.Security.hasPermission('Change Device'),
                        ddGroup:config.ddGroup
                    }
                });
            } else {
                Ext.applyIf(config.viewConfig, {
                    loadMask:true
                });
            }
            Ext.applyIf(config, {
                ui:'hierarchy',
                frame:false,
                useArrows:true,
                autoScroll:true,
                manageHeight: false,
                relationshipIdentifier:null,
                containerScroll:true,
                selectRootOnLoad:true,
                rootVisible:false,
                rootDepth:config.rootVisible ? 0 : 1,
                allowOrganizerMove:true,
                pathSeparator:"/",
                nodeIdSeparator:".",
                hideHeaders:true,
                columns:[
                    {
                        xtype:'treecolumn',
                        flex:1,
                        dataIndex:'text',
                        renderer:function (value, l, n) {
                            if (Ext.isString(value)) {
                                return value;
                            }
                            var parentNode = n.parentNode,
                                count;
                            if (Ext.isEmpty(value.count)) {
                                count = "";
                            } else {
                                count = Ext.String.format(" <span title='{0}'>({1})</span>", value.description, value.count);
                            }
                            if (parentNode.data.root == true) {
                                return Ext.String.format("<span class='rootNode'>{0}{1}</span>", value.text, count);
                            } else {
                                return Ext.String.format("<span class='subNode'>{0}</span>{1}", value.text, count);
                            }

                        }
                    }
                ]

            });
            if (config.router) {
                Ext.applyIf(config, {
                    addNodeFn:config.router.addNode,
                    deleteNodeFn:config.router.deleteNode
                });
            }
            else {
                Ext.applyIf(config, {
                    addNodeFn:Ext.emptyFn,
                    deleteNodeFn:Ext.emptyFn
                });
            }
            var root = config.root || {};
            if (config.directFn && !config.loader) {
                var modelId = Ext.String.format('Zenoss.tree.{0}Model', config.id);

                var model = Ext.define(modelId, {
                    extend:'Ext.data.Model',
                    treeId:config.id,
                    idProperty:config.idProperty || 'id',
                    getOwnerTree:function () {
                        return Ext.getCmp(this.treeId);
                    },
                    /**
                     * Used by the tree store to determine what
                     * to send to the server
                     **/
                    getId:function () {
                        return this.get("uid");
                    },
                    proxy:{
                        simpleSortMode: true,
                        type:'direct',
                        directFn:config.directFn,
                        paramOrder:['uid']
                    },
                    fields:Zenoss.model.BASE_TREE_FIELDS.concat(config.extraFields || [])
                });
                config.store = new Ext.create('Ext.data.TreeStore', {
                    model:modelId,
                    nodeParam:'uid',
                    defaultRootId:root.uid,
                    remoteSort: false,
                    sorters: {
                        sorterFn: config.sortFn || sortTreeNodes,
                        direction: 'asc'
                    },
                    uiProviders:{
                        // 'hierarchy': Zenoss.HierarchyTreeNodeUI
                    }
                });
                Ext.destroyMembers(config, 'directFn', 'ddGroup');
            }
            Ext.applyIf(root, {
                id:root.id,
                uid:root.uid,
                text:_t(root.text || root.id)
            });
            this.root = root;
            this.stateHash = {};
            if (config.stateful) {
                this.stateEvents = this.stateEvents || [];
                this.stateEvents.push('expandnode', 'collapsenode');
            }

            Zenoss.HierarchyTreePanel.superclass.constructor.apply(this, arguments);
        },
        setNodeVisible:function (nodeId, visible) {
            var node = this.getStore().getNodeById(nodeId),
                view = this.getView(),
                el = Ext.fly(view.getNodeByRecord(node));
            if (el) {
                el.setVisibilityMode(Ext.Element.DISPLAY);
                el.setVisible(visible);
            }
        },
        getState:function () {
            return {stateHash:this.stateHash};
        },
        applyState:function (state) {
            if (state) {
                Ext.apply(this, state);
                this.setStateListener();
            }
        },
        setStateListener:function () {
            this.store.on({
                load:{ scope:this, fn:function () {
                    for (var p in this.stateHash) {
                        if (this.stateHash.hasOwnProperty(p)) {
                            this.expandPath(this.stateHash[p]);
                        }
                    }
                }}
            });
        },
        initEvents:function () {
            var me = this;
            Zenoss.HierarchyTreePanel.superclass.initEvents.call(this);

            if (this.selectRootOnLoad && !Ext.History.getToken()) {
                this.getRootNode().on('expand', function () {
                    // The first child is our real root
                    if (this.getRootNode().firstChild) {
                        me.addHistoryToken(me.getView(), this.getRootNode().firstChild);
                        me.getRootNode().firstChild.expand();
                        me.getSelectionModel().select(this.getRootNode().firstChild);
                    }
                }, this, {single:true});
            } else {

                // always expand the first shown root if we can
                this.getRootNode().on('expand', function () {
                    if (this.getRootNode().firstChild) {
                        this.getRootNode().firstChild.expand();
                    }
                }, this, {single:true});
            }
            this.addEvents('filter');
            this.on('itemclick', this.addHistoryToken, this);
            this.on({
                beforeexpandnode:function (node) {
                    this.stateHash[node.id] = node.getPath();
                },
                beforecollapsenode:function (node) {
                    delete this.stateHash[node.id];
                    var tPath = node.getPath();
                    for (var t in this.stateHash) {
                        if (this.stateHash.hasOwnProperty(t)) {
                            if (-1 !== this.stateHash[t].indexOf(tPath)) {
                                delete this.stateHash[t];
                            }
                        }
                    }
                }
            });    // add some listeners for state
        },
        addHistoryToken:function (view, node) {
            Ext.History.add(this.id + Ext.History.DELIMITER + node.get('id'));
        },
        update:function (data) {
            function doUpdate(root, data) {
                Ext.each(data, function (datum) {
                    var node = root.findChild('id', datum.id);
                    if (node) {
                        node.data = datum;
                        node.setText(node.data.text);
                        doUpdate(node, datum.children);
                    }
                });
            }

            doUpdate(this.getRootNode(), data);

        },
        selectByToken:function (nodeId) {
            nodeId = unescape(nodeId);
            var root = this.getRootNode(),
                selNode = Ext.bind(function () {
                    var sel = this.getSelectionModel().getSelectedNode(),
                        uid, child;
                    if (!(sel && nodeId === sel.id)) {
                        var path = this.getNodePathById(nodeId);
                        this.selectPath(path);
                    }
                }, this);

            if (!root.isLoaded()) {
                // Listen on expand because if we listen on the store's load expand
                // gets double-called.
                root.on('expand', selNode, this, {single:true});
            } else {
                selNode();
            }
        },

        /**
         * Given a nodeId this returns the full path to the node. By convention
         * nodeIds are the uid with a "." in place of a "/". So for example on the
         * infrastructure page this method would recieve ".zport.dmd.Device.Server" and
         * return "/Devices/.zport.dmd.Devices/.zport.dmd.Devices.Server"
         *
         * Override this method if your tree implements a custom path setup
         **/
        getNodePathById:function (nodeId) {
            var depth = this.root.uid.split('/').length - this.rootDepth,
                parts = nodeId.split(this.nodeIdSeparator),
                path = [],
                segment = Ext.Array.splice(parts, 0, depth + 1).join(this.nodeIdSeparator);

            // grab the first depth pieces of the id (e.g. .zport.dmd.Devices)
            path.push(this.initialConfig.root.id);
            // each segment of the path will have the previous segment as a piece of it
            path.push(segment);

            Ext.each(parts, function (piece) {
                // We need to skip the piece of the path that represents the
                // relationship between the organizer and the object:
                // e.g.: .zport.dmd.Something.SampleOrganizer.{relationshipIdentifier}.myObject
                // We do still need to add it to the segment that is reused for
                // each piece of the overall path.
                segment = segment + this.nodeIdSeparator + piece;
                if (piece != this.relationshipIdentifier) {
                    path.push(segment);
                }
                else {
                    // stop iterating over the path once we've found the
                    // relationshipIdentifier, but make sure to push on the
                    // last 'chunk'.
                    // Trying to get something like this:
                    // foo.bar.baz.{relationshipIdentifier}.monkey =>
                    //     ["foo.bar.baz", "monkey"]
                    var idPartsWithoutRelationshipId = nodeId.split(
                            this.nodeIdSeparator + this.relationshipIdentifier + this.nodeIdSeparator);

                    if (idPartsWithoutRelationshipId.length > 1) {
                        path.push(segment + this.nodeIdSeparator + idPartsWithoutRelationshipId.pop());
                        // stop Ext.each iteration - this prevents generating
                        // segements for any further parts of the 'path' that
                        // may have been generated by splitting by the nodeIdSeparator
                        // such as in the case of mibs:
                        // .zport.dmd.Mibs.TestMib.mibs.1.2.4.5.6.6.7.2
                        return false;
                    }
                }
            }, this);
            return "/" + path.join(this.pathSeparator);
        },
        /**
         * This takes a node anywhere in the hierarchy and
         * will go back up to the parents and expand until it hits
         * the root node. This is a workaround for selectPath being nonfunctional
         * in Ext4
         *@param Ext.data.NodeInterface child
         **/
        expandToChild:function (child) {
            var parentNode = child.parentNode;

            // go back up and expand to this point
            while (parentNode) {
                // at the pseudo root nothing is further up
                if (Ext.isEmpty(parentNode.get('path'))) {
                    break;
                }

                if (!parentNode.isExpanded() && parentNode.hasChildNodes()) {
                    parentNode.expand();
                }
                parentNode = parentNode.parentNode;
            }
        },
        createDeepLinkPath:function (node) {
            var path = this.id + Ext.History.DELIMITER + node.get("uid").replace(/\//g, '.');
            return path;
        },
        afterRender:function () {
            Zenoss.HierarchyTreePanel.superclass.afterRender.call(this);
            var liveSearch = Zenoss.settings.enableLiveSearch,
                listeners = {
                    scope:this,
                    keypress:function (field, e) {
                        if (e.getKey() === e.ENTER) {
                            this.filterTree(field);
                        }
                    }
                };

            if (liveSearch) {
                listeners.change = this.filterTree;
            }
            if (this.searchField && this.ownerCt.regSearchListeners) {
                this.ownerCt.regSearchListeners(listeners);
            }
            this.getRootNode().expand(false, true, function (node) {
                node.expandChildNodes();
            });
        },
        expandAll:function () {
            // we have a hidden pseudo-root so we need to
            // expand all from the first visible root
            if (this.getRootNode().firstChild) {
                this.getRootNode().firstChild.expand(true);
            } else {
                this.callParent(arguments);
            }
        },
        filterTree:function (e) {
            if (!this.onFilterTask) {
                this.onFilterTask = new Ext.util.DelayedTask(function () {
                    this.doFilter(e);
                }, this);
            }

            this.onFilterTask.delay(1000);
        },
        postFilter: function(){
            var rootNode = this.getRootNode(),
                childNodes = rootNode.childNodes;


            // select the first leaf
            while (childNodes.length) {
                if (childNodes[0].childNodes.length) {
                    childNodes = childNodes[0].childNodes;
                } else {
                    break;
                }
            }

            this.getSelectionModel().select(childNodes[0]);

            // and then focus on back on the filter text
            this.up('HierarchyTreePanelSearch').down('searchfield').focus([false]);
        },
        getFilterFn: function(text) {
            var regex = new RegExp(Ext.String.escapeRegex(text),'i');
            var fn = function(item){
                // text can be either an object with the property text or a string
                var attr = item.get('text');
                if (Ext.isObject(attr)) {
                    attr = attr.text;
                }
                return regex.test(attr);
            };
            return fn;
        },
        doFilter:function (e) {
            var text = e.getValue(),
                me = this,
                root = this.getRootNode(),
                store = this.getStore();
            store.clearFilter(true);

            this.fireEvent('filter', e);
            if (text) {
                store.filter(new Ext.util.Filter({
                    filterFn: this.getFilterFn(text)
                }));
            }
        },

        addNode:function (type, id) {
            this.addChildNode({type:type, id:id});
        },

        addChildNode:function (params) {
            var selectedNode = this.getSelectionModel().getSelectedNode();
            var parentNode;
            if (selectedNode.leaf) {
                parentNode = selectedNode.parentNode;
            } else {
                parentNode = selectedNode;
            }
            var contextUid = parentNode.data.uid;
            Ext.applyIf(params, {
                contextUid:contextUid
            });

            this.addTreeNode(params);
        },

        addTreeNode:function (params) {
            var callback = function (provider, response) {
                var result = response.result;
                var me = this;
                if (result.success) {
                    // look for another node on result and assume it's the new node, grab it's id
                    // TODO would be best to normalize the names of result node
                    var nodeId = Zenoss.env.PARENT_CONTEXT + '/' + params.id;
                    this.getStore().load({
                        callback:function () {
                            nodeId = nodeId.replace(/\//g, '.');
                            me.selectByToken(nodeId);
                        }
                    });

                }
                else {
                    Ext.Msg.alert('Error', result.msg);
                }
            };
            this.addNodeFn(params, Ext.bind(callback, this));
        },

        deleteSelectedNode:function () {
            var node = this.getSelectionModel().getSelectedNode();
            var me = this;
            var parentNode = node.parentNode;
            var uid = node.get('uid');
            var params = {uid:uid};

            function callback(provider, response) {
                // Only update the UI if the response indicates success
                if (Zenoss.util.isSuccessful(response)) {
                    // Select the parent node since the current one was deleted.
                    me.getSelectionModel().select(parentNode);

                    // Refresh the parent node's tree to remove our node.
                    me.getStore().load({
                        callback:function () {
                            me.selectByToken(parentNode.get('uid'));
                            me.getRootNode().firstChild.expand();
                        }
                    });
                }
            }

            // all hierarchytreepanel's have an invisible root node with depth of 0
            if (node.getDepth() <= 1) {
                Zenoss.message.error(_t('You can not delete the root node'));
                return;
            }

            this.deleteNodeFn(params, callback);
        },

        canMoveOrganizer:function (organizerUid, targetUid) {
            var orgPieces = organizerUid.split('/'),
                targetPieces = targetUid.split('/');

            // make sure we can actually move organizers
            if (!this.allowOrganizerMove) {
                return false;
            }

            // Relying on a coincidence that the third item
            // is the top level organizer (e.g. Locations, Groups)
            return orgPieces[3] === targetPieces[3];
        },
        refresh:function (callback, scope) {
            this.getStore().load({
                scope:this,
                callback:function () {
                    this.getRootNode().expand();
                    Ext.callback(callback, scope || this);
                    if (this.getRootNode().childNodes.length) {
                        this.getRootNode().childNodes[0].expand();
                    }
                }
            });
        }
    }); // HierarchyTreePanel

})();
Ext.ns('Zenoss');

/**
 * @class Zenoss.SearchField
 * @extends Ext.form.TextField
 * @constructor
 */
Ext.define("Zenoss.SearchField", {
    extend: "Ext.form.TextField",
    alias: ['widget.searchfield'],
    constructor: function(config){
        config = Ext.applyIf(config||{}, {
            validationDelay: 500,
            selectOnFocus: true
        });
        config.cls += ' x-field-search';
        Zenoss.SearchField.superclass.constructor.apply(this, arguments);
    },
    getClass: function(){
        var cls = this.altCls ? this.altCls : 'searchfield';
        return this.black ? cls + '-black' : cls;
    },
    onRender: function() {
        Zenoss.SearchField.superclass.onRender.apply(this, arguments);
        this.wrap = this.el.boxWrap(this.getClass());
        if (this.bodyStyle) {
            this.wrap.setStyle(this.bodyStyle);
        }
        this.resizeEl = this.positionEl = this.wrap;
        this.syncSize();
    },
    syncSize: function(){
        this.el.setBox(this.el.parent().getBox());
    }

}); // Ext.extend


/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


/* package level */
(function() {

Ext.ns('Zenoss.form');

Ext.define("Zenoss.form.LinkField", {
    extend: "Ext.form.DisplayField",
    alias: ['widget.linkfield'],
    initComponent: function() {
        this.callParent(arguments);
        // make sure our value is established
        // before rendering
        this.setValue(this.value);
    },
    getValue: function() {
        return this.rawValue;
    },
    setValue: function(value) {
        var origValue = value;
        if (Ext.isEmpty(value)) {
            value = _t('None');
        } else {
            if (Ext.isArray(value)){
                var items = [];
                Ext.each(value, function(v){
                    items.push(Zenoss.render.link(v));
                });
                value = items.join('<br/>');
            } else {
                value = Zenoss.render.link(value);
            }
        }
        this.callParent([value]);
        this.rawValue = origValue;
    }
 });


})();
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


(function() {

var ZF = Ext.ns('Zenoss.form');

Ext.form.TextArea.prototype.grow = true;
Ext.form.TextArea.prototype.growMin = 20;

function isField(c) {
    return !!c.setValue && !!c.getValue && !!c.markInvalid && !!c.clearInvalid;
}

ZF.createDirectSubmitFunction = function(router) {

    // called in the Ext.form.Action.DirectSubmit.run method
    return function(formElDom, successFunction, directSubmitAction) {

        var form = directSubmitAction.form;

        // copy field values to the info object for fields that
        //   * are dirty (param passed to getFieldValues above)
        //   * have submitValue true
        //   * have an id or name set on them
        var info = {};
        var dirtyFieldValues = form.getValues(false, true);

        Ext.iterate(dirtyFieldValues, function(key, value) {
            var field = form.findField(key);
            if ( field.submitValue !== false && field.getName().indexOf("ext-gen") !== 0 ) {
                info[key] = value;
            }
        });


        // add the forms baseParams to the info object (often includes uid)
        Ext.applyIf(info, directSubmitAction.getParams());

        Ext.iterate(info, function(key, value) {
            if (key.indexOf("ext-gen") !== 0 ) {
                info[key] = value;
            }else {
                delete info[key];
            }
        });

        // define a callback to run after server responds
        var callback = function() {
            form.clearInvalid();
            form.setValues(dirtyFieldValues); // isDirty() will return false now
            form.afterAction(directSubmitAction, true);
            form.reset();
            Zenoss.message.info(_t("Details updated successfully"));
        };

        // the remote call
        router.setInfo(info, callback, directSubmitAction);

    };
};

Ext.define("Zenoss.form.BaseDetailForm", {
    extend: "Ext.form.FormPanel",
    alias: ['widget.basedetailform'],
    contextUid: null,
    isLoadInProgress: false,
    constructor: function(config){
        // Router doesn't technically matter, since they all do getInfo, but
        // getForm is definitely defined on DeviceRouter
        var router = config.router || Zenoss.remote.DeviceRouter;
        config.baseParams = Ext.applyIf(config.baseParams||{
            uid: config.contextUid
        });

        config = Ext.applyIf(config||{}, {
            paramsAsHash: true,
            autoScroll: 'y',
            cls: 'detail-form-panel',
            buttonAlign: 'left',
            fieldDefaults: {
                labelAlign: 'top'
            },
            trackResetOnLoad: true,
            permission: 'Manage Device',
            api: {
                submit: ZF.createDirectSubmitFunction(router),
                load: router.getInfo
            }
        });
        var hasPermission = function() {
            var perm = !Zenoss.Security.doesNotHavePermission(config.permission);
            if (Ext.isDefined(config.userCanModify)) {
                return config.userCanModify && perm;
            } else {
                return perm;
            }
        };
        if (hasPermission()) {
            Ext.apply(config, {
                buttons:  [{
                    xtype: 'button',
                    ref: '../savebtn',
                    text: _t('Save'),
                    disabled: true,
                    cls: 'detailform-submit-button',
                    handler: function(btn, e) {
                        this.refOwner.getForm().submit();
                    }
                },{
                    xtype: 'button',
                    ref: '../cancelbtn',
                    disabled: true,
                    text: _t('Cancel'),
                    cls: 'detailform-cancel-button',
                    handler: function(btn, e) {
                        this.refOwner.getForm().reset();
                    }
                }]
            });
        }
        ZF.BaseDetailForm.superclass.constructor.call(this, config);
    },
    initComponent: function() {
        this.callParent(arguments);
        var form = this.getForm();
        form.on('dirtychange', function(form, dirty, options ) {
            if (dirty && form.isValid()) {
                this.setButtonsDisabled(false);
            }
        }, this);
    },
    validityChange: function(f, valid, eOpts) {
       if (valid) {
           this.setButtonsDisabled(false);
       }
    },
    hasPermission: function() {
        var perm = !Zenoss.Security.doesNotHavePermission(this.permission);
        if (Ext.isDefined(this.userCanModify)) {
            return this.userCanModify && perm;
        } else {
            return perm;
        }
    },
    setButtonsDisabled: function(b) {
        if (this.hasPermission()) {
            this.savebtn.setDisabled(b);
            this.cancelbtn.setDisabled(b);
        }
    },
    doButtons: function() {
        this.setButtonsDisabled(!this.form.isDirty());
    },
    onFieldAdd: function(field) {
        if (!field.isXType('displayfield')) {
            this.mon(field, 'valid', this.doButtons, this);
        }
    },
    getFieldNames: function() {
        var keys = [];
        for (var k in this.getForm().getValues(false, false)) {
            if (Ext.Array.indexOf(keys, k)==-1) {
                keys.push(k);
            }
        }
        return keys;
    },
    load: function() {
        var o = Ext.apply({keys:this.getFieldNames()}, this.baseParams);
        this.form.load(o, function(result) {
            this.form.setValues(result.data);
            this.form.reset();
            this.doLayout();
        }, this);
    },
    setContext: function(uid) {
        this.contextUid = uid;
        this.baseParams.uid = uid;
        this.isLoadInProgress = true;
        this.load();
    }
});

})();
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


/* package level */
(function() {

var ZF = Ext.ns('Zenoss.form');

Ext.define("Zenoss.form.AutoFormPanel", {
    extend: "Zenoss.form.BaseDetailForm",
    alias: ['widget.autoformpanel']
});



/*
* Zenoss.form.getGeneratedForm
* Accepts a uid and a callback.
* Asks the router for a form for the object represented by uid.
* Returns a config object that can be added to a container to render the form.
*/
ZF.getGeneratedForm = function(uid, callback, router) {
    // Router doesn't technically matter, since they all do getInfo, but
    // getForm is definitely defined on DeviceRouter
    router = router || Zenoss.remote.DeviceRouter;
    router.getForm({uid:uid}, function(response){
        callback(Ext.apply({
            xtype:'autoformpanel',
            contextUid: uid,
            layout: 'column',
            defaults: {
                layout: 'anchor',
                bodyStyle: 'padding:10px',
                fieldDefaults: {
                    labelAlign: 'top'
                },
                columnWidth: 0.5
            }
        }, response.form));
    });
}

Ext.define("Zenoss.form.AutoFormCombo", {
    extend: "Ext.form.ComboBox",
    alias: ['widget.autoformcombo'],
     constructor: function(config) {
         config = Ext.applyIf(config||{}, {
             editable: false,
             forceSelection: true,
             autoSelect: true,
             triggerAction: 'all',
             queryMode: 'local',
             store: config.values || []
         });
         Zenoss.form.AutoFormCombo.superclass.constructor.call(this, config);
     }

});


})();
/*****************************************************************************
 *
 * Copyright (C) Zenoss, Inc. 2009, all rights reserved.
 *
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 *
 ****************************************************************************/


(function(){

Ext.ns('Zenoss');

function objectRenderer(obj) {
    if (obj) {
        return obj.name;
    }
    return "";
}
var deviceColumns = [
    {
        dataIndex: 'name',
        header: _t('Device'),
        id: 'name',
        flex: 1,
        hideable: false,
        renderer: function(name, row, record) {
            return Zenoss.render.Device(record.data.uid, name);
        }
    },{
        width: 100,
        dataIndex: 'ipAddress',
        header: _t('IP Address'),
        renderer: function(ip, row, record) {
            return record.data.ipAddressString;
        }
    },{
        dataIndex: 'uid',
        header: _t('Device Class'),
        id: 'deviceClass',
        width: 120,
        renderer: Zenoss.render.DeviceClass
    },{
        id: 'productionState',
        dataIndex: 'productionState',
        width: 100,
        filter: {
            xtype: 'multiselect-prodstate'
        },
        header: _t('Production State'),
        renderer: function(value) {
            return Zenoss.env.PRODUCTION_STATES_MAP[value];
        }

    },{
        id: 'serialNumber',
        dataIndex: 'serialNumber',
        width: 100,
        hidden: true,
        header: _t('Serial Number')
    },{
        id: 'tagNumber',
        dataIndex: 'tagNumber',
        width: 100,
        hidden: true,
        header: _t('Tag Number')
    },{
        id: 'hwManufacturer',
        dataIndex: 'hwManufacturer',
        width: 100,
        header: _t('Hardware Manufacturer'),
        hidden: true,
        renderer: objectRenderer
    },{
        id: 'hwModel',
        dataIndex: 'hwModel',
        hidden: true,
        width: 100,
        header: _t('Hardware Model'),
        renderer: objectRenderer
    },{
        id: 'osManufacturer',
        dataIndex: 'osManufacturer',
        width: 100,
        header: _t('OS Manufacturer'),
        hidden: true,
        renderer: objectRenderer
    },{
        id: 'osModel',
        dataIndex: 'osModel',
        width: 150,
        hidden: true,
        header: _t('OS Model'),
        renderer: objectRenderer
    },{
        dataIndex: 'collector',
        width: 100,
        hidden: true,
        header: _t('Collector')
    },{
        id: 'priorityString',
        dataIndex: 'priority',
        width: 100,
        hidden: true,
        filter: false,
        header: _t('Priority'),
        renderer: function(value) {
            return Zenoss.env.PRIORITIES_MAP[value];
        }
    },{
        dataIndex: 'systems',
        width: 100,
        hidden: true,
        sortable: false,
        header: _t('Systems'),
        renderer: function(systems) {
            var links = [];
            if (systems) {
                Ext.each(systems, function(system){
                    links.push(Zenoss.render.DeviceSystem(system.uid, system.name));
                });
            }
            return links.join(" | ");
        }
    },{
        dataIndex: 'groups',
        width: 100,
        hidden: true,
        sortable: false,
        header: _t('Groups'),
        renderer: function(groups) {
            var links = [];
            if (groups) {
                Ext.each(groups, function(group){
                    links.push(Zenoss.render.DeviceGroup(group.uid, group.name));
                });
            }
            return links.join(" | ");

        }
    },{
        dataIndex: 'location',
        width: 100,
        hidden: true,
        sortable: false,
        header: _t('Location'),
        renderer: function(loc){
            if (loc){
                return Zenoss.render.DeviceLocation(loc.uid, loc.name);
            }
            return '';
        }
    },{
        id: 'worstevents',
        sortable: false,
        filter: false,
        width: 75,
        dataIndex: 'events',
        header: _t('Events'),
        renderer: function(ev, ignored, record) {
            var table = Zenoss.render.worstevents(ev),
            url = record.data.uid + '/devicedetail?filter=default#deviceDetailNav:device_events';
            if (table){
                table = table.replace('table', 'table onclick="location.href=\''+url+'\';"');
            }
            return table;
        }
    }
];

Ext.define("Zenoss.DeviceGridSelectionModel", {
    extend:"Zenoss.ExtraHooksSelectionModel",

    // Default to 'MULTI'-selection mode.
    mode: 'MULTI',

    /** _selectAll
     *
     * Set to true when the user has chosen the 'select all' records.
     *
     * @private
     * @type boolean
     */
    _selectAll: false,

    /** _excludedRecords
     *
     * Stores the set of records (IDs, hashes, ??) specifically
     * deselected from the set of all selected records.
     *
     * @private
     * @type dictionary
     */
    _excludedRecords: {},

    constructor: function(config) {
        this.callParent([config]);
        this.on('select', this._includeRecord, this);
        this.on('deselect', this._excludeRecord, this);
    },

    /** _includeRecord
     *
     * Include the record in the selection. Removes the record from the
     * set of excluded records.
     *
     * @private
     * @param sm {Zenoss.DeviceGridSelectionModel}
     * @param record {Zenoss.device.DeviceModel}
     * @param index {Integer}
     */
    _includeRecord: function(sm, record, index) {
        if (record && this._selectAll) {
            delete this._excludedRecords[record.getId()];
        }
    },

    /** _excludeRecord
     *
     * Exclude the record from the selection. Includes the record in the
     * set of excluded records.
     *
     * @private
     * @param sm {Zenoss.DeviceGridSelectionModel}
     * @param record {Zenoss.device.DeviceModel}
     * @param index {Integer}
     */
    _excludeRecord: function(sm, record, index) {
        if (record && this._selectAll) {
            this._excludedRecords[record.getId()] = true;
        }
    },

    /** _handleStoreDataChange
     *
     * Callback for handling changes to the grid's datastore.  When the
     * _selectAll flag is set, this function removes the current selection
     * and selects all the records currently in the datastore.
     *
     * @private
     */
    _handleStoreDataChange: function() {
        if (this._selectAll) {
            this.suspendEvents();
            var data = this.store.data.filterBy(
                    function(item) {
                        return (! this._excludedRecords[item.getId()]);
                    },
                    this
                );
            this.select(data.items, false, true);
            this.resumeEvents();
            this.fireEvent('selectionchange', this);
        }
    },

    /** bind
     *
     * The grid will use this method to bind the datastore to the
     * grid's selection model.
     *
     * @override
     * @param store {Ext.data.Store}
     * @param initial {boolean}
     */
    bind: function(store, initial){
        if (!initial && this.store) {
            if (store !== this.store && this.store.autoDestroy) {
                this.store.destroyStore();
            } else {
                this.store.un("datachanged", this._handleStoreDataChange, this);
            }
        }
        if (store) {
            store = Ext.data.StoreManager.lookup(store);
            store.on("datachanged", this._handleStoreDataChange, this);
        }
        this.store = store;
        if (store && !initial) {
            this.refresh();
        }
    },

    /** selectAll
     *
     * Sets the _selectAll flag before selecting 'all' the records.
     *
     * @override
     */
    selectAll: function() {
        this._selectAll = true;
        this.callParent([true]);
    },

    /** selectNone
     *
     * Unsets the _selectAll flag before deselecting all the records.
     */
    selectNone: function() {
        this._selectAll = false;
        // reset the set of excluded records to the empty set.
        this._excludedRecords = {};
        // Deselect all the records without firing an event for each
        // selected record.
        this.deselectAll([true]);
        this.fireEvent('selectionchange', this);
    },

    /** deselectAll
     *
     * Doesn't deselect anything if the _selectAll flag is set.
     * This works around other parts of the ExtJS framework that
     * invoke this method without passing suppressEvents = true.
     *
     * @override
     */
    deselectAll: function() {
        if (! this._selectAll) {
            this.callParent(arguments);
        }
    },

    /** clearSelections
     *
     * Clears out all the selections only if the _selectAll flag
     * is not set.
     *
     * @override
     */
    clearSelections: function() {
        if (this.isLocked() || this._selectAll) {
            return;
        }

        // Suspend events to avoid firing the whole chain for every row
        this.suspendEvents();

        // make sure all rows are deselected so that UI renders properly
        // base class only deselects rows it knows are selected; so we need
        // to deselect rows that may have been selected via selectstate
        this.deselect(this.store.data.items, true);

        // Bring events back and fire one selectionchange for the batch
        this.resumeEvents();

        this.fireEvent('selectionchange', this);

        this.callParent(arguments);
    }
});


Ext.define('Zenoss.device.DeviceModel',{
    extend: 'Ext.data.Model',
    fields: [
        {name: 'uid', type: 'string'},
        {name: 'name', type: 'string'},
        {name: 'ipAddress', type: 'int'},
        {name: 'ipAddressString', type: 'string'},
        {name: 'productionState', type: 'string'},
        {name: 'serialNumber', type: 'string'},
        {name: 'tagNumber', type: 'string'},
        {name: 'hwManufacturer', type: 'object'},
        {name: 'hwModel', type: 'object'},
        {name: 'osManufacturer', type: 'object'},
        {name: 'osModel', type: 'object'},
        {name: 'collector', type: 'string'},
        {name: 'priority', type: 'string'},
        {name: 'systems', type: 'object'},
        {name: 'groups', type: 'object'},
        {name: 'location', type: 'object'},
        {name: 'events', type: 'object'},
        {name: 'availability', type: 'float'},
        {name: 'pythonClass', type: 'string'}
    ],
    idProperty: 'uid'
});

/**
 * @class Zenoss.DeviceStore
 * @extend Zenoss.DirectStore
 * Direct store for loading devices
 */
Ext.define("Zenoss.DeviceStore", {
    alias: ['widget.DeviceStore'],
    extend: "Zenoss.DirectStore",
    constructor: function(config) {
        config = config || {};
        Ext.applyIf(config, {
            autoLoad: false,
            pageSize: Zenoss.settings.deviceGridBufferSize,
            model: 'Zenoss.device.DeviceModel',
            initialSortColumn: "name",
            directFn: Zenoss.remote.DeviceRouter.getDevices,
            root: 'devices'
        });
        this.callParent(arguments);
    }
});

/**
 * @class Zenoss.DeviceGridPanel
 * @extends Zenoss.FilterGridPanel
 * Main grid panel for displaying a device. Used on the It Infrastructure page.
 **/
Ext.define("Zenoss.DeviceGridPanel", {
    extend: "Zenoss.FilterGridPanel",
    alias: ['widget.DeviceGridPanel', 'widget.SimpleDeviceGridPanel'],
    lastHash: null,
    constructor: function(config) {
        var storeConfig = config.storeCfg || {};
        var store = Ext.create('Zenoss.DeviceStore', storeConfig);

        Ext.applyIf(config, {
            store: store,
            columns: deviceColumns
        });

        this.callParent(arguments);
        this.on('itemdblclick', this.onItemDblClick, this);
    },

    onItemDblClick: function(view, record) {
        window.location = record.get("uid");
    },
    applyOptions: function(options){
        // only request the visible columns
        var visibleColumns = Zenoss.util.filter(this.columns, function(c){
                return !c.hidden;
            }),
            keys = Ext.Array.pluck(visibleColumns, 'dataIndex');

        keys.push('ipAddressString');
        keys.push('pythonClass');
        Ext.apply(options.params, {
            keys: keys
        });
    }
});

function showComponentLockingDialog(msg, locking, funcs) {
        Ext.create('Zenoss.dialog.LockForm', {
            applyOptions: function(values) {
                Ext.applyIf(values, funcs.fetcher());
            },
            title: msg == "" ? _t("Lock Device") : _t("Lock Devices"),
            message: msg,
            updatesChecked: locking.updates,
            deletionChecked: locking.deletion,
            sendEventChecked: locking.events,
            submitFn: function(values) {
                funcs.REMOTE.lockDevices(values, funcs.saveHandler);
            }
        }).show();
}

/**********************************************************************
 *
 * Device Actions
 *
 */
    /**
     * Drop down of action items that you can use against
     * a device. The two required parameters are
     *@param 1. saveHandler = function to be called after the action (refresh the grid etc)
     *@param 2. deviceFetcher = function that returns the list of device records
     *@class Zenoss.DeviceActionMenu
     *@extends Ext.Button
     **/
    Ext.define("Zenoss.DeviceActionMenu", {
        alias: ['widget.deviceactionmenu'],
        extend: "Ext.Button",
        constructor: function(config) {
            config = config || {};
            if (!config.saveHandler) {
                throw "Device Action Menu did not receive a save handler";
            }
            if (!config.deviceFetcher) {
                throw "Device Action Menu did not receive a device fetcher";
            }
            var fetcher = config.deviceFetcher,
                saveHandler = config.saveHandler,
                REMOTE = Zenoss.remote.DeviceRouter;

            Ext.applyIf(config, {
                text: _t('Actions'),
                disabled: Zenoss.Security.doesNotHavePermission('Delete Device'),
                menu: {
                    items: [
                        new Zenoss.Action({
                            text: _t('Lock Devices') + '...',
                            iconCls: 'lock',
                            permission: 'Change Device',
                            handler: function() {
                            var sel = fetcher().uids,
                                funcs = {'fetcher': fetcher, 'saveHandler': saveHandler, 'REMOTE': REMOTE};

                                if(sel.length == 0){
                                    Zenoss.message.warning(_t("Please select 1 or more devices to lock"));
                                    return;
                                }
                                if(sel.length > 1){
                                    showComponentLockingDialog(_t("To view locked state, select one device at a time."), "", funcs);
                                }else{
                                    REMOTE.getInfo({
                                        uid: fetcher().uids[0],
                                        keys: ['locking']
                                    }, function(result){
                                        if (result.success) {
                                            showComponentLockingDialog("", result.data.locking, funcs);
                                        }
                                    });
                                }

                            }
                        }),
                        new Zenoss.Action({
                            text: _t('Reset IP'),
                            iconCls: 'set',
                            permission: 'Change Device',
                            handler: function(){
                                new Zenoss.dialog.SimpleMessageDialog({
                                    message: Ext.String.format(_t('Are you sure you want to reset the IP addresses of these devices to the results of a DNS lookup?')),
                                    title: _t('Reset IP'),
                                    buttons: [{
                                        xtype: 'DialogButton',
                                        text: _t('OK'),
                                        handler: function() {
                                            REMOTE.resetIp(fetcher(), saveHandler);
                                        }
                                    }, {
                                        xtype: 'DialogButton',
                                        text: _t('Cancel')
                                    }]
                                }).show();
                            }
                        }),
                        /*
                         * Currently causes a bus error on multiple devices: http://dev.zenoss.org/trac/ticket/6142
                         * Commenting out until that is fixed
                         *
                        resetCommunity: new Zenoss.Action({
                            text: _t('Reset Community'),
                            iconCls: 'set',
                            permission: 'Change Device',
                            handler: function(){
                                Ext.Msg.show({
                                    title: _t('Reset Community'),
                                    msg: _t('Are you sure you want to reset the SNMP '+
                                            'community strings of these devices?'),
                                    buttons: Ext.Msg.YESNO,
                                    fn: function(r) {
                                        switch(r) {
                                          case 'no':
                                            break;
                                          case 'yes':
                                            REMOTE.resetCommunity(gridOptions(), resetGrid);
                                            break;
                                        default:
                                            break;
                                        }
                                    }
                                });
                            }
                        }),
                        */
                        new Zenoss.Action({
                            text: _t('Set Production State')+'...',
                            iconCls: 'set',
                            permission: 'Change Device Production State',
                            handler: function(){
                                var win = new Zenoss.FormDialog({
                                    title: _t('Set Production State'),
                                    modal: true,
                                    width: 310,
                                    height: 150,
                                    items: [{
                                        xtype: 'ProductionStateCombo',
                                        fieldLabel: _t('Select a production state'),
                                        id: 'prodstate',
                                        listeners: {
                                            'select': function(){
                                                Ext.getCmp('prodstateok').enable();
                                            }
                                        }
                                    }],
                                    buttons: [{
                                        xtype: 'DialogButton',
                                        id: 'prodstateok',
                                        disabled: true,
                                        text: _t('OK'),
                                        handler: function(){
                                            var opts = Ext.apply(fetcher(), {
                                                prodState:Ext.getCmp('prodstate').getValue()
                                            });
                                            REMOTE.setProductionState(opts, saveHandler);
                                        }
                                    }, Zenoss.dialog.CANCEL
                                             ]
                                });
                                win.show();
                            }
                        }),
                        new Zenoss.Action({
                            text: _t('Set Priority')+'...',
                            iconCls: 'set',
                            permission: 'Change Device',
                            handler: function(){
                                var win = new Zenoss.FormDialog({
                                    title: _t('Set Priority'),
                                    modal: true,
                                    width: 310,
                                    height: 150,
                                    items: [{
                                        xtype: 'PriorityCombo',
                                        id: 'device_action_priority',
                                        fieldLabel: _t('Select a priority'),
                                        listeners: {
                                            'select': function(){
                                                Ext.getCmp('priorityok').enable();
                                            }
                                        }
                                    }],
                                    buttons: [{
                                        xtype: 'DialogButton',
                                        id: 'priorityok',
                                        disabled: true,
                                        text: _t('OK'),
                                        handler: function(){
                                            var opts = Ext.apply(fetcher(), {
                                                priority: Ext.getCmp('device_action_priority').getValue()
                                            });
                                            REMOTE.setPriority(opts, saveHandler);
                                        }
                                    }, Zenoss.dialog.CANCEL
                                             ]
                                });
                                win.show();
                            }
                        }),
                        new Zenoss.Action({
                            text: _t('Set Collector') + '...',
                            iconCls: 'set',
                            permission: 'Change Device',
                            handler: function(){
                                var win = new Zenoss.FormDialog({
                                    title: _t('Set Collector'),
                                    modal: true,
                                    width: 310,
                                    height: 180,
                                    items: [{
                                        xtype: 'combo',
                                        fieldLabel: _t('Select a collector'),
                                        id: 'collector',
                                        queryMode: 'local',
                                        store: new Ext.data.ArrayStore({
                                            data: Zenoss.env.COLLECTORS,
                                            fields: ['name']
                                        }),
                                        valueField: 'name',
                                        displayField: 'name',
                                        forceSelection: true,
                                        editable: false,
                                        listeners: {
                                            'select': function(){
                                                Ext.getCmp('collectorok').enable();
                                            }
                                        }
                                    },{
                                         xtype: 'checkbox',
                                         name: 'moveData',
                                         id: 'moveData',
                                         fieldLabel: _t('Move Data')
                                    }],
                                    buttons: [{
                                        xtype: 'DialogButton',
                                        id: 'collectorok',
                                        disabled: true,
                                        text: _t('OK'),
                                        handler: function(){
                                            var opts = Ext.apply(fetcher(), {
                                                collector: Ext.getCmp('collector').getValue(),
                                                moveData: Ext.getCmp('moveData').getValue()
                                            });
                                            opts['asynchronous'] = Zenoss.settings.deviceMoveIsAsync(opts.uids);
                                            REMOTE.setCollector(opts, saveHandler);
                                        }
                                    }, Zenoss.dialog.CANCEL
                                             ]
                                });
                                win.show();
                            }
                        })]
                }
            });
            Zenoss.DeviceActionMenu.superclass.constructor.apply(this, arguments);
        }
    });


})(); // end of function namespace scoping
/*****************************************************************************
 *
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 *
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 *
 ****************************************************************************/

(function(){
    Ext.ns('Zenoss.events');

    Zenoss.events.getRowClass = function(record, index) {
        var stateclass = record.get('eventState')=='New' ?
            'unacknowledged':'acknowledged';
        var sev = Zenoss.util.convertSeverity(record.get('severity'));
        var rowcolors = Ext.state.Manager.get('rowcolor') ? 'rowcolor rowcolor-' : '';
        return rowcolors + sev + '-' + stateclass + ' ' + stateclass;
    };

    /*
     * Show the dialog that allows one to add an event.
     */
    function showAddEventDialog(gridId) {
        if (Ext.getCmp('addeventwindow')) {
            Ext.getCmp('addeventwindow').show();
            return;
        }
        var device;
        if (Zenoss.env.device_uid) {
            device = Zenoss.env.device_uid.split("/").reverse()[0];
        }
        var addevent = Ext.create('Zenoss.dialog.BaseWindow', {
            title: _t('Create Event'),
            id: 'addeventwindow',
            layout: 'fit',
            autoHeight: true,
            modal: true,
            width: 310,
            closeAction: 'hide',
            plain: true,
            items: [{
                id: 'addeventform',
                xtype: 'form',
                defaults: {width: 290},
                autoHeight: true,
                frame: false,
                listeners: {
                    validitychange: function(form, isValid){
                        addevent.query('DialogButton')[0].setDisabled(!isValid);
                    }
                },
                fieldDefaults: {
                    labelWidth: 100
                },
                items: [{
                    xtype: 'textarea',
                    name: 'summary',
                    fieldLabel: _t('Summary'),
                    allowBlank: false
                },{
                    xtype: 'textfield',
                    fieldLabel: _t('Device'),
                    name: 'device',
                    allowBlank: false,
                    value: device
                },{
                    xtype: 'textfield',
                    fieldLabel: _t('Component'),
                    name: 'component'
                },{
                    fieldLabel: _t('Severity'),
                    name: 'severity',
                    xtype: 'combo',
                    store: Zenoss.env.SEVERITIES,
                    typeAhead: true,
                    allowBlank: false,
                    forceSelection: true,
                    triggerAction: 'all',
                    value: 5,
                    selectOnFocus: true
                },{
                    xtype: 'textfield',
                    fieldLabel: _t('Event Class Key'),
                    name: 'evclasskey'
                },{
                    fieldLabel: _t('Event Class'),
                    name: 'evclass',
                    xtype: 'combo',
                    allowBlank: true,
                    store: Zenoss.env.EVENT_CLASSES,
                    typeAhead: true,
                    forceSelection: true,
                    triggerAction: 'all',
                    selectOnFocus: true,
                    listConfig: {
                        resizable: true
                    }
                }],
                buttons: [{
                    text: _t('Submit'),
                    xtype: 'DialogButton',
                    formBind: true,
                    handler: function(){
                        var form = Ext.getCmp('addeventform');
                        Zenoss.remote.EventsRouter.add_event(
                            form.getForm().getValues(),
                            function(){
                                addevent.hide();
                                var grid = Ext.getCmp(gridId);
                                grid.refresh();
                            }
                        );
                    }
                },{
                    text: _t('Cancel'),
                    xtype: 'DialogButton',
                    handler: function(){
                        addevent.hide();
                    }
                }]
            }]

        });
        addevent.show();
    }

    /*
     * Show the dialog that allows one to classify an event
     */
    function showClassifyDialog(gridId) {

        var win = new Zenoss.dialog.BaseWindow({
            title: _t('Classify Events'),
            width: 300,
            autoHeight: true,
            modal: true,
            plain: true,
            items: [{
                id: 'classifyEventForm',
                xtype: 'form',
                monitorValid: true,
                autoHeight: true,
                frame: false,
                items: [{
                    padding: 10,
                    style: {'font-size':'10pt'},
                    html: _t('Select the event class with which'+
                             ' you want to associate these events.')
                },{
                    xtype: 'combo',
                    store: Zenoss.env.EVENT_CLASSES,
                    typeAhead: true,
                    allowBlank: false,
                    forceSelection: true,
                    triggerAction: 'all',
                    width: 180,
                    style: {'margin-left':'100px'},
                    listConfig: {
                        resizable: true
                    },
                    emptyText: _t('Select an event class'),
                    selectOnFocus: true,
                    id: 'evclass_combo'
                }],
                listeners: {
                    fieldvaliditychange: function(form, field, isValid) {
                        Ext.getCmp('classifyEventFormSubmitButton').setDisabled(!isValid);
                    },
                    scope: win
                },
                buttons: [{
                    text: _t('Submit'),
                    xtype: 'DialogButton',
                    id: 'classifyEventFormSubmitButton',
                    disabled: true,
                    handler: function(){
                        var cb = Ext.getCmp('evclass_combo'),
                        grid = Ext.getCmp(gridId),
                        sm = grid.getSelectionModel(),
                        rs = sm.getSelection(),
                        evrows = [];
                        Ext.each(rs, function(record){
                            evrows[evrows.length] = record.data;
                        });
                        if (!evrows.length) {
                            win.hide();
                            new Zenoss.dialog.ErrorDialog({message: _t('No events were selected.')});
                        } else {
                            Zenoss.remote.EventsRouter.classify({
                                'evclass': cb.getValue(),
                                'evrows': evrows
                            }, function(result){
                                win.destroy();
                                var title = result.success ?
                                    _t('Classified'):
                                    _t('Error');
                                Ext.MessageBox.show({
                                    title: title,
                                    msg: Ext.htmlDecode(result.msg),
                                    buttons: Ext.MessageBox.OK
                                });
                            });
                        }
                    }
                },{
                    text: _t('Cancel'),
                    xtype: 'DialogButton',
                    handler: function(){
                        win.destroy();
                    }
                }]
            }]

        });

        win.show();
    }

    Zenoss.events.EventPanelToolbarActions = {
        acknowledge: new Zenoss.ActionButton({
            iconCls: 'acknowledge',
            tooltip: _t('Acknowledge events'),
            permission: 'Manage Events',
            itemId: 'acknowledge',
            handler: function() {
                Zenoss.EventActionManager.execute(Zenoss.remote.EventsRouter.acknowledge);
            }
        }),
        close: new Zenoss.ActionButton({
            iconCls: 'close',
            tooltip: _t('Close events'),
            permission: 'Manage Events',
            itemId: 'close',
            handler: function() {
                Zenoss.EventActionManager.execute(Zenoss.remote.EventsRouter.close);
            }
        }),
        reclassify: new Zenoss.ActionButton({
            iconCls: 'classify',
            tooltip: _t('Reclassify an event'),
            permission: 'Manage Events',
            itemId: 'classify',
            handler: function(button) {
                var gridId = button.ownerCt.ownerCt.id;
                showClassifyDialog(gridId);
            }
        }),
        reopen: new Zenoss.ActionButton({
            iconCls: 'unacknowledge',
            tooltip: _t('Unacknowledge events'),
            permission: 'Manage Events',
            itemId: 'unacknowledge',
            handler: function() {
                Zenoss.EventActionManager.execute(Zenoss.remote.EventsRouter.reopen);
            }
        }),
        unclose: new Zenoss.ActionButton({
            iconCls: 'reopen',
            tooltip: _t('Reopen events'),
            permission: 'Manage Events',
            itemId: 'reopen',
            handler: function() {
                Zenoss.EventActionManager.execute(Zenoss.remote.EventsRouter.reopen);
            }
        }),
        newwindow: new Zenoss.ActionButton({
            iconCls: 'newwindow',
            permission: 'View',
            tooltip: _t('Go to event console'),
            handler: function(btn) {
                var grid = btn.grid || this.ownerCt.ownerCt,
                curState = Ext.state.Manager.get('evconsole') || {},
                filters = curState.filters || {},
                opts = filters.options || {},
                pat = /devices\/([^\/]+)(\/.*\/([^\/]+)$)?/,
                matches = grid.view.getContext().match(pat),
                st, url;

                // on the device page
                if (matches) {
                    opts.device = matches[1];
                    if (matches[3]) {
                        opts.component = matches[3];
                    }
                }
                filters.options = opts;
                curState.filters = filters;
                st = encodeURIComponent(Zenoss.util.base64.encode(Ext.encode(curState)));
                url = '/zport/dmd/Events/evconsole?state=' + st;
                window.open(url, '_newtab', "");
            }
        }),
        refresh: new Zenoss.ActionButton({
            iconCls: 'refresh',
            permission: 'View',
            tooltip: _t('Refresh events'),
            handler: function(btn) {
                var grid = btn.grid || this.ownerCt.ownerCt;
                if(grid.getComponent("event_panel")) grid = grid.getComponent("event_panel");
                grid.refresh();
            }
        })
    };

    Ext.define("Zenoss.model.EventType", {
        extend: 'Ext.data.Model',
        idProperty: 'id',
        fields: ['id', 'event_type']
    });

    Zenoss.EventConsoleTBar = Ext.extend(Zenoss.LargeToolbar, {
        constructor: function(config){
            var gridId = config.gridId,
                showActions = true,
                showCommands = true,
                configureMenuItems,
                tbarItems = config.tbarItems || [],
                eventSpecificTbarActions = ['acknowledge', 'close', 'reopen', 'unacknowledge', 'addNote'];
            if (!gridId) {
                throw ("Event console tool bar did not receive a grid id");
            }
            configureMenuItems = [{
                id: 'rowcolors_checkitem',
                xtype: 'menucheckitem',
                text: _t('Show severity row colors'),
                handler: function(checkitem) {
                    var checked = checkitem.checked;
                    var grid = Ext.getCmp(gridId);
                    grid.toggleRowColors(checked);
                }
            },{
                id: 'clearfilters',
                text: _t('Clear filters'),
                listeners: {
                    click: function(){
                        Ext.getCmp(gridId).clearFilters();
                    }
                }
            },{
                text: _t("Restore defaults"),
                handler: function(){
                    new Zenoss.dialog.SimpleMessageDialog({
                        message: Ext.String.format(_t('Are you sure you want to restore '
                                                  + 'the default configuration? All'
                                                  + ' filters, column sizing, and column order '
                                                  + 'will be lost.')),
                        title: _t('Confirm Restore'),
                        buttons: [{
                            xtype: 'DialogButton',
                            text: _t('OK'),
                            handler: function() {
                                Ext.getCmp(gridId).resetGrid();
                            }
                        }, {
                            xtype: 'DialogButton',
                            text: _t('Cancel')
                        }]
                    }).show();
                }
            }];

            if (!_global_permissions()['manage events'])
                configureMenuItems.unshift({
                    id: 'excludenonactionables_checkitem',
                    xtype: 'menucheckitem',
                    text: _t('Only show actionable events'),
                    handler: function(checkitem) {
                        var checked = checkitem.checked;
                        var grid = Ext.getCmp(gridId);
                        var tbar = grid.tbar;
                        if (tbar && tbar.getComponent) {
                            Ext.each(eventSpecificTbarActions, function(actionItemId) {
                                var cmp = tbar.getComponent(actionItemId);
                                if (cmp) {
                                    cmp.filtered = checked;
                                    cmp.updateDisabled();
                                }
                            });
                        }
                        grid.toggleNonActionables(checked);
                    }
                });

            if (/^\/zport\/dmd\/Events/.test(window.location.pathname)) {
                configureMenuItems.splice(2, 0, {
                    text: _t('Save this configuration...'),
                    handler: function(){
                        var grid = Ext.getCmp(gridId),
                        link = grid.getPermalink();
                        new Zenoss.dialog.ErrorDialog({
                            message: Ext.String.format(_t('<div class="dialog-link">'
                                                      + 'Drag this link to your bookmark bar '
                                                      + '<br/>to return to this configuration later.'
                                                      + '<br/><br/><a href="'
                                                      + link
                                                      + '">Resource Manager: Events</a></div>')),
                            title: _t('Save Configuration')
                        });
                    }
                });
            }

            // actions
            if (Ext.isDefined(config.actionsMenu)) {
                showActions = config.actionsMenu;
            }

            if (showActions) {
                tbarItems.push({
                    id: 'event-actions-menu',
                    text: _t('Actions'),
                    xtype: 'deviceactionmenu',
                    deviceFetcher: function() {
                        var grid = Ext.getCmp(gridId),
                        sm = grid.getSelectionModel(),
                        rows = sm.getSelection(),
                        ranges = [],
                        pluck = Ext.Array.pluck,
                        uids = pluck(pluck(pluck(rows, 'data'), 'device'), 'uid'),
                        opts =  {
                            uids: uids,
                            ranges: [],
                            hashcheck: 'none'
                        };
                        opts.params = grid.filterRow.getSearchValues();
                        // filter out the nulls
                        opts.uids = Zenoss.util.filter(opts.uids, function(uid){
                            return uid;
                        });

                        return opts;
                    },
                    saveHandler: Ext.emptyFn
                });
            }

            // commands
            if (Ext.isDefined(config.commandsMenu)) {
                showCommands = config.commandsMenu;
            }
            if (showCommands) {
                tbarItems.push({
                    id: 'event-commands-menu',
                    text: _t('Commands'),
                    hidden: !showCommands,
                    disabled: Zenoss.Security.doesNotHavePermission('Run Commands'),
                    setContext: function(uid) {
                        if (!uid) {
                            uid = '/zport/dmd/Devices';
                        }
                        var me = Ext.getCmp('event-commands-menu'),
                        menu = me.menu;
                        // load the available commands from the server
                        // commands are based on context
                        Zenoss.remote.DeviceRouter.getUserCommands({uid:uid}, function(data) {
                            menu.removeAll();
                            Ext.each(data, function(d) {
                                menu.add({
                                    text:d.id,
                                    tooltip:d.description,
                                    handler: function(item) {
                                        var command = item.text,
                                            grid = Ext.getCmp(gridId),
                                            sm = grid.getSelectionModel(),
                                            selections = sm.getSelection(),
                                            devids = Ext.Array.pluck(Ext.Array.pluck(Ext.Array.pluck(selections, 'data'), 'device'), 'uid');

                                        // filter out the none device events
                                        devids = Zenoss.util.filter(devids, function(uid){ return uid; });
                                        if (devids.length) {

                                            // only run commands for the visible devices
                                            var win = new Zenoss.CommandWindow({
                                                uids: devids,
                                                target: uid + '/run_command',
                                                command: command
                                            });
                                            win.show();
                                        }
                                    }
                                });
                            });
                        });
                    },
                    menu: {}
                });
            }
            this.gridId = gridId;

            if (!config.hideDisplayCombo) {
                tbarItems.push('-');
                tbarItems.push(Ext.create('Ext.toolbar.TextItem', {
                    hidden: config.hideDisplayCombo || false,
                    text: _t('Display: ')
                }));
                tbarItems.push(Ext.create('Ext.form.ComboBox', {
                    id: 'history_combo',
                    hidden: config.hideDisplayCombo || false,
                    name: 'event_display',
                    queryMode: 'local',
                    store: new Ext.data.SimpleStore({
                        model: 'Zenoss.model.EventType',
                        data: [[0,'Events'],[1,'Event Archive']]
                    }),
                    displayField: 'event_type',
                    valueField: 'id',
                    width: 120,
                    value: 0,
                    triggerAction: 'all',
                    forceSelection: true,
                    editable: false,
                    listeners: {
                        select: function(selection) {
                            var archive = selection.value == 1,
                                grid = Ext.getCmp(gridId),
                                yesterday = new Date();

                            // reload the grid. changing the filters
                            grid.setStoreParameter('archive', archive);

                            // if history set default lastseen to yesterday
                            if (archive) {
                                yesterday.setDate(yesterday.getDate() - 1);
                                grid.setFilter('lastTime', yesterday);
                            }else{
                                grid.setFilter('lastTime', null);
                            }
                        }
                    }
                }));

            }
            if (config.newwindowBtn) {
                tbarItems.push('-');
                tbarItems.push(Zenoss.events.EventPanelToolbarActions.newwindow);
            }

            Zenoss.EventActionManager.configure({
                onFinishAction: function() {
                    var grid = Ext.getCmp(gridId);
                    if(Ext.get('event_panel')){
                        grid = Ext.getCmp('event_panel');
                    }
                    if (grid) {
                        grid.refresh();
                    }
                },
                findParams: function() {
                    var grid = Ext.getCmp(gridId);
                    if(Ext.get('event_panel')){
                        grid = Ext.getCmp('event_panel');
                    }
                    if (grid) {
                        var params = grid.getSelectionParameters();
                        if (Zenoss.env.device_uid) {
                            params.uid = Zenoss.env.device_uid;
                        }
                        return params;
                    }
                }
            });

            Ext.applyIf(config, {
                ref: 'tbar',
                listeners: {
                    beforerender: function(){
                        var grid = Ext.getCmp(gridId),
                        tbar = this;
                        if (tbar.getComponent) {
                            Ext.each(eventSpecificTbarActions, function(actionItemId) {
                                var cmp = tbar.getComponent(actionItemId);
                                if (cmp) {
                                    cmp.filtered = grid.excludeNonActionables;
                                }
                            });
                        }
                    },
                    afterrender: function(){
                        var grid = Ext.getCmp(gridId),
                        store = grid.getStore(),
                        tbar = this,
                        view = grid.getView();
                        store.on('guaranteedrange', this.doLastUpdated);
                        view.on('buffer', this.doLastUpdated);

                        view.on('filterchange', function(){
                            tbar.refreshmenu.setDisabled(!view.isValid());

                            // Hook up the "Last Updated" text
                            if ( !view.isValid() ) {
                                var box = Ext.getCmp('lastupdated');
                                box.setText(_t(''));
                            }
                        });
                        // set up the commands menu
                        var context = Zenoss.env.device_uid || Zenoss.env.PARENT_CONTEXT;
                        if (context == "/zport/dmd/Events") {
                            context = location.pathname.replace('/viewEvents', '');
                        }

                        this.setContext(context);
                    },
                    scope: this
                },
                items: Ext.Array.union([
                    // create new instances of the action otherwise Ext won't render them (probably a bug in 4.1)
                    new Zenoss.ActionButton(Zenoss.events.EventPanelToolbarActions.acknowledge.initialConfig),
                    new Zenoss.ActionButton(Zenoss.events.EventPanelToolbarActions.close.initialConfig),
                    new Zenoss.ActionButton(Zenoss.events.EventPanelToolbarActions.reclassify.initialConfig),
                    new Zenoss.ActionButton(Zenoss.events.EventPanelToolbarActions.reopen.initialConfig),
                    new Zenoss.ActionButton(Zenoss.events.EventPanelToolbarActions.unclose.initialConfig),
                    new Zenoss.ActionButton({
                        iconCls: 'addslide',
                        tooltip: _t('Add Log'),
                        permission: 'Manage Events',
                        itemId: 'addNote',
                        handler: function(button) {
                            var grid = Ext.getCmp(gridId),
                                sm = grid.getSelectionModel(),
                                selected = sm.getSelection(),
                                data = Ext.pluck(selected, "data"),
                                uuids = Ext.pluck(data, "evid"),
                                addNoteWindow;

                            addNoteWindow = Ext.create('Zenoss.dialog.BaseWindow', {
                                title: _t('Add Note'),
                                id: 'addNoteWindow',
                                layout: 'fit',
                                autoHeight: true,
                                modal: true,
                                width: 310,
                                plain: true,
                                items: [{
                                    id: 'addNoteForm',
                                    xtype: 'form',
                                    defaults: {width: 290},
                                    autoHeight: true,
                                    frame: false,
                                    fieldDefaults: {
                                        labelWidth: 100
                                    },
                                    items: [{
                                        xtype: 'textarea',
                                        name: 'note',
                                        fieldLabel: _t('note'),
                                        allowBlank: false
                                    }],
                                    buttons: [{
                                        text: _t('Submit'),
                                        xtype: 'DialogButton',
                                        formBind: true,
                                        handler: function() {
                                            var form = Ext.getCmp('addNoteForm'),
                                                note = form.getValues().note;

                                            Ext.each(uuids, function(uuid) {
                                                Zenoss.remote.EventsRouter.write_log(
                                                {
                                                    evid: uuid,
                                                    message: note
                                                });
                                            });
                                        }
                                    },{
                                        text: _t('Cancel'),
                                        xtype: 'DialogButton',
                                        handler: function(){
                                            addNoteWindow.hide();
                                        }
                                    }]
                                }]
                            });
                            addNoteWindow.show();
                        }
                    }),
                    new Zenoss.ActionButton({
                        iconCls: 'add',
                        tooltip: _t('Add an event'),
                        permission: 'Manage Events',
                        handler: function(button) {

                            showAddEventDialog(gridId);
                        }
                    }),
                    {
                        xtype: 'tbseparator'
                    },
                    Zenoss.events.EventPanelToolbarSelectMenu,
                    {
                        text: _t('Export'),
                        id: 'export-button',
                        //iconCls: 'export',
                        menu: {
                            items: [{
                                text: 'XML',
                                handler: function(){
                                    var context = Zenoss.env.device_uid || Zenoss.env.PARENT_CONTEXT;
                                    if (context == "/zport/dmd/Events") {
                                        context = location.pathname.replace('/viewEvents', '');
                                    }

                                    var grid = Ext.getCmp(gridId),
                                        state = grid.getState(),
                                        historyCombo = Ext.getCmp('history_combo'),
                                        params = {
                                            type: 'xml',
                                            isHistory: false,
                                            params: {
                                                uid: context,
                                                fields: Ext.Array.pluck(state.columns, 'id'),
                                                sort: state.sort.property,
                                                dir: state.sort.direction,
                                                params: grid.getExportParameters()
                                            }
                                        };
                                    if (historyCombo && historyCombo.getValue() == 1) {
                                        params.isHistory = true;
                                    }
                                    Ext.get('export_body').dom.value =
                                        Ext.encode(params);
                                    Ext.get('exportform').dom.submit();
                                }
                            }, {
                                text: 'CSV',
                                handler: function(){
                                    var context = Zenoss.env.device_uid || Zenoss.env.PARENT_CONTEXT;
                                    if (context == "/zport/dmd/Events") {
                                        context = location.pathname.replace('/viewEvents', '');
                                    }
                                    var grid = Ext.getCmp(gridId),
                                    state = Ext.getCmp(gridId).getState(),
                                    historyCombo = Ext.getCmp('history_combo'),
                                    params = {
                                        type: 'csv',
                                        params: {
                                            uid: context,
                                            fields: Ext.Array.pluck(state.columns, 'id'),
                                            sort: state.sort.property,
                                            dir: state.sort.direction,
                                            params: grid.getExportParameters()
                                        }
                                    };
                                    if (historyCombo && historyCombo.getValue() == 1) {
                                        params.isHistory = true;
                                    }
                                    Ext.get('export_body').dom.value =
                                        Ext.encode(params);
                                    Ext.get('exportform').dom.submit();
                                }
                            }]
                        }
                    },
                    {
                        text: _t('Configure'),
                        id: 'configure-button',
                        //iconCls: 'customize',
                        menu: {
                            items: configureMenuItems
                        }
                    },{
                        xtype: 'tbfill'
                    },{
                        id: 'lastupdated',
                        xtype: 'tbtext',
                        cls: 'lastupdated',
                        text: _t('Updating...')
                    },{
                        xtype: 'refreshmenu',
                        ref: 'refreshmenu',
                        id: 'refresh-button',
                        iconCls: 'refresh',
                        text: _t('Refresh'),
                        handler: function() {
                            var grid = Ext.getCmp(gridId);
                            if (grid.isVisible(true)) {
                                grid.refresh();
                            }
                        }
                    }
                ], tbarItems)
            });
            Zenoss.EventConsoleTBar.superclass.constructor.call(this, config);
        },
        doLastUpdated: function() {
            var box = Ext.getCmp('lastupdated'),
            dt = new Date(),
            dtext = Ext.Date.format(dt, 'g:i:sA');
            box.setText(_t('Last updated at ') + dtext);
        },
        setContext: function(uid) {
            var commands = Ext.getCmp('event-commands-menu');
            if (commands) {
                commands.setContext(uid);
            }
        }
    });

    /**
     * @class Zenoss.EventPanelSelectionModel
     * @extends Zenoss.ExtraHooksSelectionModel
     *
     */
        Ext.define("Zenoss.EventPanelSelectionModel", {
            extend:"Zenoss.ExtraHooksSelectionModel",
            selectState: null,
            badIds: {},
            mode: 'MULTI',
            constructor: function(config){
                this.callParent([config]);
                this.on('select', this.handleRowSelect, this);
                this.on('deselect', this.handleRowDeSelect, this);
                this.on('selectionchange', function(selectionmodel) {
                    // Disable buttons if nothing selected (and vice-versa)
                    var actionsToChange = ['acknowledge', 'close', 'reopen',
                                           'unacknowledge', 'classify', 'addNote'],
                        newDisabledValue = !selectionmodel.hasSelection() && selectionmodel.selectState !== 'All',
                        tbar = this.getGrid().tbar,
                        history_combo = Ext.getCmp('history_combo'),
                        archive = Ext.isDefined(history_combo) ? history_combo.getValue() === 1 : false;
                    if (archive) {
                        // These are always disabled on the archive event console
                        tbar.getComponent('acknowledge').setDisabled(true);
                        tbar.getComponent('close').setDisabled(true);
                        tbar.getComponent('reopen').setDisabled(true);
                        tbar.getComponent('unacknowledge').setDisabled(true);

                        // This is conditionally enabled/disabled based on selection
                        tbar.getComponent('classify').setDisabled(newDisabledValue);
                    }
                    else {
                        // tbar is not present on component event consoles
                        if (tbar && tbar.getComponent) {
                            Ext.each(actionsToChange, function(actionItemId) {
                                if(tbar.getComponent(actionItemId)){
                                    tbar.getComponent(actionItemId).setDisabled(newDisabledValue);
                                }
                            });
                        }
                    }
                });


            },
            getGrid: function() {
                if (!Ext.isDefined(this.grid)) {
                    this.grid = Ext.getCmp(this.gridId);
                }
                return this.grid;
            },
            handleRowSelect: function(sm, record, index){
                if (record) {
                    delete this.badIds[record.get("evid")];
                }
            },
            handleRowDeSelect: function(sm, record, index){
                if (this.selectState && record) {
                    this.badIds[record.get("evid")] = 1;
                }
            },
            onStoreLoad: function() {
                var store = this.grid.getStore();
                if (this.selectState == 'All') {
                    this.suspendEvents();
                    var items = Zenoss.util.filter(store.data.items, function(item){
                        return (! this.badIds[item.get('evid')]);
                    }, this);
                    this.select(items, false, true);
                    this.resumeEvents();
                    this.fireEvent('selectionchange', this);
                }
            },
            selectEventState: function(state){
                var me = this,
                    grid = this.getGrid(),
                    store = grid.getStore();
                if (state === 'All') {
                    // suppress events
                    return this.selectAll(true);
                }
                this.clearSelections(true);
                // Suspend events to avoid firing the whole chain for every row
                this.suspendEvents();

                Ext.each(store.data.items, function(record){
                    if (record) {
                        if (record.data.eventState == state) {
                            me.select(record, true);
                        }
                    }
                });
                this.selectState = state;

                // Bring events back and fire one selectionchange for the batch
                this.resumeEvents();
                this.fireEvent('selectionchange', this);
            },
            clearSelectState: function() {
                this.selectState = null;
                this.grid.getStore().un('datachanged', this.onStoreLoad, this);
                this.grid.disableSavedSelection(false);
            },
            setSelectState: function(state) {
                this.selectState = state;
                if (state === 'All') {
                    this.grid.getStore().on('datachanged', this.onStoreLoad, this);
                    this.grid.disableSavedSelection(true);
                }
            },
            selectNone: function(){
                this.clearSelections(true);
                this.clearSelectState();
                // Fire one selectionchange to make buttons figure out their
                // disabledness
                this.fireEvent('selectionchange', this);
            },
            clearSelections: function(fast){
                if (this.isLocked() || !this.grid) {
                    return;
                }

                // Suspend events to avoid firing the whole chain for every row
                this.suspendEvents();
                if(!fast){
                    //make sure all rows are deselected so that UI renders properly
                    //base class only deselects rows it knows are selected; so we need
                    //to deselect rows that may have been selected via selectstate
                    this.deselect(this.grid.getStore().data.items);
                }
                // Bring events back and fire one selectionchange for the batch
                this.resumeEvents();
                this.fireEvent('selectionchange', this);

                this.badIds = {};
                Zenoss.EventPanelSelectionModel.superclass.clearSelections.apply(this, arguments);
            }
        });

    /**
     * @class Zenoss.EventsJsonReader
     * @extends Zenoss.ExtraHooksSelectionModel
     *
     * Subclass the Ext JsonReader so that we can override how data is fetched
     * from a record that is returned by the router. Custom details use keys that
     * contain dots (zenpacks.foo.bar.baz) so we need to force key-method access.
     */
    Ext.define("Zenoss.EventsJsonReader", {
        extend: "Ext.data.reader.Json",
        alias: 'reader.events',
        useSimpleAccessors: true,
        createAccessor : function(){
            return function(expr) {
                return function(obj){
                    return obj[expr];
                };
            };
        }()
    });



    /**
     * @class Zenoss.events.Store
     * @extend Zenoss.DirectStore
     * Direct store for loading ip addresses
     */
    Ext.define("Zenoss.events.Store", {
        extend: "Zenoss.DirectStore",
        constructor: function(config) {
            config = config || {};
            Ext.applyIf(config, {
                model: 'Zenoss.events.Model',
                initialSortColumn: 'severity',
                initialSortDirection: 'DESC',
                pageSize: Zenoss.settings.eventConsoleBufferSize,
                proxy: {
                    type: 'direct',
                    simpleSortMode: true,
                    directFn: config.directFn || Zenoss.remote.EventsRouter.query,
                    reader: {
                        type: 'events',
                        root: 'events',
                        totalProperty: 'totalCount'
                    }
                }


            });
            this.callParent(arguments);
        }
    });

    Zenoss.events.customColumns = {};
    Zenoss.events.registerCustomColumn = function(dataIndex, obj) {
        Zenoss.events.customColumns[dataIndex] = obj;
    };

    Zenoss.events.eventFields = [];
    /**
     * This is how zenpack authors can register event fields that they want pulled from the server,
     * but may not be visible in a colum. So if you add the following line to your javascript:
     *     Zenoss.events.registerEventField("ipAddress");
     * On every browser request the ipAddress field will be populated
     **/
    Zenoss.events.registerEventField = function(dataIndex) {
        Zenoss.events.eventFields.push(dataIndex);
    };

    /**
     * @class Zenoss.events.Grid
     * @extends Zenoss.FilterGridPanel
     * Base Class for the event panels
     **/
    Ext.define('Zenoss.events.Grid', {
        extend: 'Zenoss.FilterGridPanel',
        rowcolors: false,
        excludeNonActionables: false,
        constructor: function(config) {
            config = config || {};
            config.viewConfig = config.viewConfig || {};
            Ext.applyIf(config.viewConfig, {
                getRowClass: Zenoss.events.getRowClass

            });

            this.callParent(arguments);
            this.on('itemclick', this.onItemClick, this );
            this.on('filterschanged', this.onFiltersChanged, this);
            this.excludeNonActionables = !_global_permissions()['manage events'] && Ext.state.Manager.get('excludeNonActionables');
            this.getStore().autoLoad = true;
        },
        initComponent: function() {
            this.getSelectionModel().grid = this;
            this.callParent(arguments);

            this.headerCt.on('columnhide', this.onColumnChange, this);
            this.headerCt.on('columnshow', this.onColumnChange, this);
        },
        /**
         * Listeners for when you hide/show a column, the data isn't fetched yet so
         * we need to refresh the grid to get it. Otherwise there will be a blank column
         * until the page is manually refreshed.
         **/
        onColumnChange:function () {
            if (!this.onColumnChangeTask) {
                this.onColumnChangeTask = new Ext.util.DelayedTask(function () {
                    this.refresh();
                }, this);
            }

            // give them one second to hide/show other columns
            this.onColumnChangeTask.delay(1000);
        },
        onItemClick: function(){
            this.getSelectionModel().clearSelectState();
        },
        listeners: {
            beforerender: function(){
                this.rowcolors = Ext.state.Manager.get('rowcolor');
                // Some event consoles (Impact Events) do not use severity
                // config colors.  Check and see if it's being used before
                // trying to use it.
                var rowcolorsCheckItem = Ext.getCmp('rowcolors_checkitem');
                if (rowcolorsCheckItem)
                    rowcolorsCheckItem.setChecked(this.rowcolors);

                var excludeNonActionablesCheckItem = Ext.getCmp('excludenonactionables_checkitem');
                if (excludeNonActionablesCheckItem)
                    excludeNonActionablesCheckItem.setChecked(this.excludeNonActionables);
            }
        },
        applyOptions: function() {
            var store = this.getStore(),
                keys,
                columns = this.headerCt.getGridColumns();

            columns = Zenoss.util.filter(columns, function(col) {
                return !col.hidden;
            });
            keys = Ext.Array.pluck(columns, "dataIndex");
            // always have these fields for reclassifying
            keys = Ext.Array.union(keys, ["evid", "eventClass", "eventClassKey", "message"]);

            // grab any fields zenpack authors may add
            keys = Ext.Array.union(keys, Zenoss.events.eventFields);
            store.setBaseParam("keys", keys);
            store.setParamsParam("excludeNonActionables", this.excludeNonActionables);
        },
        getSelectionParameters: function() {
            var grid = this,
            sm = grid.getSelectionModel(),
            evids = [],  // Event IDs selected
            uid,
            sels = sm.getSelection();  // UI records selected
            if(Ext.isEmpty(sels)){ // if nothing is selected, check and see if there's an event_panel
                if(Ext.get('event_panel')) sels = Ext.getCmp('event_panel').getSelectionModel().getSelection();
            }
            var selectedAll = (sm.selectState == 'All');
            if (selectedAll) {
                // If we are selecting all, we don't want to send back any evids.
                // this will make the operation happen on the filter's result
                // instead of whatever the view seems to have selected.
                sels = [];
            } else {
                Ext.each(sels, function(record){
                    evids[evids.length] = record.data.evid;
                });
            }

            // Don't run if nothing is selected.
            if (!selectedAll && Ext.isEmpty(sels)) {
                return false;
            }

            // if we are a contextual event console ALWAYS send the uid
            if (this.uid != '/zport/dmd') {
                uid = this.uid;
            }
            var params = {
                evids: evids,
                excludeIds: sm.badIds,
                uid: uid
            };
            Ext.apply(params, this.getUpdateParameters());
            return params;
        },
        clearFilters: function(){
            this.filterRow.clearFilters();
        },
        onFiltersChanged: function(grid, values) {
            // ZEN-4441: Clear selections whenever the filter changes.
            var sm = grid.getSelectionModel();
            sm.clearSelections();
            sm.clearSelectState();
        },
        /*
         * Create parameters used for exporting events. This differs from
         * getSelectionParameters in that if no events are selected, all of
         * the events matching the current filters are exported.
         */
        getExportParameters: function() {
            var params = this.getSelectionParameters();
            if (params === false) {
                params = {
                    evids: [],
                    excludeIds: []
                };
                Ext.apply(params, this.getUpdateParameters());
            }
            return params;
        },
        /*
         * Build parameters for updates (don't need to include sort information).
         */
        getUpdateParameters: function() {
            var o = {};
            o.params = this.filterRow.getSearchValues();
            o.params.excludeNonActionables = this.excludeNonActionables;
            return o;
        },
        toggleRowColors: function(bool) {
            this.rowcolors = bool;
            Ext.state.Manager.set('rowcolor', bool);
            this.refresh();
        },
        toggleNonActionables: function(bool) {
            this.excludeNonActionables = bool;
            Ext.state.Manager.set('excludeNonActionables', bool);
            this.refresh();
        },
        clearURLState: function() {
            var qs = Ext.urlDecode(window.location.search.replace(/^\?/, ''));
            if (qs.state) {
                delete qs.state;
                qs = Ext.urlEncode(qs);
                if (qs) {
                    window.location.search = '?' + Ext.urlEncode(qs);
                } else {
                    window.location.search = '';
                }
            }
        },
        getPermalink: function() {
            var l = window.location,
            path = l.protocol + '//' + l.host + l.pathname + l.hash,
            st = Zenoss.util.base64.encode(Ext.encode(this.getState()));
            return path + '?state=' + st;
        },
        resetGrid: function() {
            Ext.state.Manager.clear(this.getItemId());
            this.clearFilters();
            Zenoss.remote.EventsRouter.column_config({}, function(result){
                var results = [],
                store = this.getStore(),
                grid = this,
                filters = this.defaultFilters;
                Ext.each(result, function(r){
                    results[results.length] = Ext.decode(r);
                });
                var columns = results;
                this.reconfigure(null, columns);
                grid.filterRow.gridColumnMoveWithFilter();
                // resort by default sorter
                store.sort(store.sorters.get(0));
            }, this);
        },
        updateRows: function(){
            this.refresh();
        }
    });

    /**
     * @class Zenoss.SimpleEventGridPanel
     * @extends Zenoss.events.Grid
     * Shows events in a grid panel similar to that on the event console.
     * Fixed columns.
         * @constructor
         */
    Ext.define("Zenoss.SimpleEventGridPanel", {
            extend:"Zenoss.events.Grid",
            alias: ['widget.SimpleEventGridPanel'],
        constructor: function(config){

            var id = config.id || Ext.id();
            config.viewConfig = config.viewConfig || {};
                Ext.applyIf(config.viewConfig, {
                    getRowClass:  Zenoss.events.getRowClass
                });
            Ext.applyIf(config, {
                id: 'eventGrid' + id,
                stateId: Zenoss.env.EVENTSGRID_STATEID || 'default_eventsgrid',
                enableDragDrop: false,
                stateful: true,
                rowSelectorDepth: 5,
                store: Ext.create('Zenoss.events.Store', {}),
                appendGlob: true,
                selModel: new Zenoss.EventPanelSelectionModel({
                    grid: this
                }),
                defaultFilters: {
                    severity: [Zenoss.SEVERITY_CRITICAL, Zenoss.SEVERITY_ERROR, Zenoss.SEVERITY_WARNING, Zenoss.SEVERITY_INFO],
                    eventState: [Zenoss.STATUS_NEW, Zenoss.STATUS_ACKNOWLEDGED]
                },
                viewConfig: {
                    getRowClass:  Zenoss.events.getRowClass
                }
            }); // Ext.applyIf
            Zenoss.SimpleEventGridPanel.superclass.constructor.call(this, config);
            this.on('itemdblclick', this.onRowDblClick, this);
        }, // constructor
        onRowDblClick: function(view, record, e) {
            var evid = record.get('evid'),
                url = '/zport/dmd/Events/viewDetail?evid='+evid;
            window.open(url, evid.replace(/-/g,'_'),
                        "status=1,width=600,height=500,resizable=1");
        },
        initComponent: function() {
            this.callParent(arguments);

            /**
             * @event eventgridrefresh
             * Fires when the events grid is refreshed.
             * @param {Zenoss.SimpleEventGridPanel} this The gridpanel.
             */
            this.addEvents('eventgridrefresh');
        },
        /**
         *Since on a regular event console you can not choose which columns
         * are present we are overriding the default implementation of getState
         * to not remember the widths of columns that are not visible.
         * This is necessary because of our column definitions were creating
         * cookies larger than 8192 (the default zope max cookie size)
         **/
        getState: function(){

            var val = Zenoss.SimpleEventGridPanel.superclass.getState.call(this);
            // do not store the state of the hidden ones
            val.columns = Zenoss.util.filter(val.columns, function(col) {
                return !col.hidden;
            });
            return val;
        },
        refresh: function() {
            this.callParent(arguments);
            this.fireEvent('eventgridrefresh', this);
        }
    }); // SimpleEventGridPanel




    // Define all of the items that could be shown in an EventConsole toolbar.
    Zenoss.events.EventPanelToolbarSelectMenu = {
        text: _t('Select'),
        id: 'select-button',
        listeners: {
            afterrender: function(e){
                e.menu.items.items[0].setText(_t("Select All") );
            }
        },
        menu:{
            xtype: 'menu',
            items: [{
                text: _t("All"),
                handler: function(){
                    var grid = Ext.getCmp('select-button').ownerCt.ownerCt,
                    sm = grid.getSelectionModel();
                    sm.selectEventState('All');
                    sm.setSelectState("All");
                }
            },{
                text: 'None',
                handler: function(){
                    var grid = Ext.getCmp('select-button').ownerCt.ownerCt,
                    sm = grid.getSelectionModel();
                    sm.clearSelections();
                    sm.clearSelectState();
                }
            }]
        }
    };


    Ext.define("Zenoss.EventGridPanel", {
        extend: "Zenoss.SimpleEventGridPanel",
        alias: ['widget.EventGridPanel'],
        border:false,
        constructor: function(config) {
            Ext.applyIf(config, {
                tbar: new Zenoss.EventConsoleTBar({
                    gridId: config.id,
                    actionsMenu: config.actionsMenu,
                    commandsMenu: config.commandsMenu
                })
            });
            Zenoss.EventGridPanel.superclass.constructor.call(this, config);
        },

        onRowDblClick: function(view, record, e) {
            var evid = record.get('evid'),
                combo = Ext.getCmp('history_combo'),
                history = (combo.getValue() == '1') ? 'History' : '',
                url = '/zport/dmd/Events/view'+history+'Detail?evid='+evid;
            window.open(url, evid.replace(/-/g,'_'),
                        "status=1,width=600,height=500,resizable=1");
        },
        setContext: function(uid){
            Zenoss.EventGridPanel.superclass.setContext.call(this, uid);

            var toolbar = this.getDockedItems('toolbar')[0];
            if (toolbar && Ext.isDefined(toolbar.setContext)) {
                toolbar.setContext(uid);
            }
        }
    });

    Ext.define("Zenoss.EventRainbow", {
        extend:"Ext.toolbar.TextItem",
        alias: ['widget.eventrainbow'],
        constructor: function(config) {
            var severityCounts = {
                critical: {count: 0, acknowledged_count: 0},
                error:    {count: 0, acknowledged_count: 0},
                warning:  {count: 0, acknowledged_count: 0},
                info:     {count: 0, acknowledged_count: 0},
                debug:    {count: 0, acknowledged_count: 0},
                clear:    {count: 0, acknowledged_count: 0}
            };
            config = Ext.applyIf(config || {}, {
                height: 45,
                directFn: Zenoss.util.isolatedRequest(Zenoss.remote.DeviceRouter.getInfo),
                text: Zenoss.render.events(severityCounts, config.count || 3)
            });
            Zenoss.EventRainbow.superclass.constructor.call(this, config);
        },
        setContext: function(uid){
            if (uid) {
                this.uid = uid;
                this.refresh();
            }
        },
        refresh: function(){
            this.directFn({uid:this.uid, keys:['events']}, function(result){
                if (Zenoss.env.contextUid && Zenoss.env.contextUid != this.uid) {
                    return;
                }
                this.updateRainbow(result.data.events);
            }, this);
        },
        updateRainbow: function(severityCounts) {
            this.setText(Zenoss.render.events(severityCounts, this.count));
        }
    });



})(); // end of function namespace scoping
/*****************************************************************************
 *
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 *
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 *
 ****************************************************************************/


(function(){

Ext.ns('Zenoss');




/**
 * @class Zenoss.InstanceModel
 * @extends Ext.data.Model
 * Field definitions for the instances, matches up with the columns above
 **/
Ext.define('Zenoss.InstanceModel',  {
    extend: 'Ext.data.Model',
    idProperty: 'uid',
    fields: [
        {name: 'device'},
        {name: 'name'},
        {name: 'description'},
        {name: 'minProcessCount'},
        {name: 'maxProcessCount'},
        {name: 'monitored'},
        {name: 'pingStatus'}
    ]
});

/**
 * @class Zenoss.InstanceStore
 * @extend: Zenoss.DirectStore
 * Base store for the instances of things
 */
Ext.define("Zenoss.InstanceStore", {
    extend:"Zenoss.DirectStore",
    alias: ['widget.InstanceStore'],

    constructor: function(config) {
        Ext.applyIf(config, {
            model: 'Zenoss.InstanceModel',
            root: 'data',
            initialSortColumn: 'name'
        });
        this.callParent(arguments);
    }

});


Ext.define("Zenoss.SimpleInstanceGridPanel", {
    extend:"Zenoss.BaseGridPanel",
    alias: ['widget.SimpleInstanceGridPanel'],

    constructor: function(config) {
        var instanceColumns = [{
            id: 'instanceName',
            dataIndex: config.nameDataIndex || 'name',
            header: _t('Name'),
            flex: .25,
            width: 400
        },{
            id: 'device',
            dataIndex: 'device',
            flex: .75,
            header: _t('Device'),
            width: 200,
            sortable: false,
            renderer: function(device, row, record){
                return Zenoss.render.link(device.uid, undefined,
                                          device.name);
            }
        }, {
            dataIndex: 'minProcessCount',
            header: _t('Min Threshold'),
            width: 85,
            sortable: false,
            hidden: !config.showProcessCount
        }, {
            dataIndex: 'maxProcessCount',
            header: _t('Max Threshold'),
            width: 85,
            sortable: false,
            hidden: !config.showProcessCount
        }, {
            id: 'monitored',
            dataIndex: 'monitored',
            header: _t('Monitored'),
            width: 70,
            sortable: false
        }, {
            id: 'status',
            dataIndex: 'pingStatus',
            header: _t('Status'),
            renderer: Zenoss.render.pingStatus,
            width: 60,
            sortable: false
        }];

        Ext.applyIf(config, {
            columns: config.columns || instanceColumns,
            store: config.store || Ext.create('Zenoss.InstanceStore',{
                directFn: config.directFn,
                pageSize: config.pageSize
            }),
            selModel: config.sm || Ext.create('Zenoss.ExtraHooksSelectionModel', {
                mode: 'SINGLE'
            })
        });
        this.callParent(arguments);
    }
});

// supply the instances implementation in the config
Ext.define("Zenoss.SimpleCardPanel", {
    extend:"Ext.Panel",
    alias: ['widget.simplecardpanel'],

    constructor: function(config) {
        this.contextUid = null;
        var me = this;
        Ext.applyIf(config, {
            layout: 'card',
            activeItem: 0,
            placeholder: {},
            height: Math.min(((Ext.getCmp('viewport').getHeight() - 75)/5)+30, 200),
            tbar: {
                xtype: 'consolebar',
                centerPanel: 'detail_panel',
                title: _t('Display: '),
                parentPanel: this,
                leftItems: [{
                    xtype: 'select',
                    ref: '../displaySelect',
                    queryMode: 'local',
                    value: config.instancesTitle,
                    store: [config.instancesTitle, _t('Configuration Properties')],
                    listeners: {
                        select: function(displaySelect, records) {
                            var index = records[0].index;
                            this.layout.setActiveItem(index);
                        },
                        scope: this
                    }
                }]
            },
            items: [
                config.instances,
            {
                xtype: 'configpropertypanel',
                id: 'config_property_panel',
                ref: 'zPropertyEdit',
                displayFilters: false,
                viewName: 'zPropertyEdit',
                listeners: config.zPropertyEditListeners
            }]
        });
        this.callParent(arguments);
    },
    setContext: function(uid) {
        // only reload our datastores if we are not collapsed
        this.contextUid = uid;
        if (!this.collapsed){
            this.loadInstances(uid);
        }
    },
    loadInstances: function(){
        if (!this.contextUid){
            return;
        }
        var contextUid = this.contextUid;
        // if we have not set our store since we last updated the
        // context uid update it now
        this.items.each(function(item) {
            item.setContext(contextUid);
        });
        this.contextUid = null;
    }

});

// has the instances used by the Netwoks, Processes and the two Services pages
Ext.define("Zenoss.InstanceCardPanel", {
    extend:"Zenoss.SimpleCardPanel",
    alias: ['widget.instancecardpanel'],

    constructor: function(config) {
        var gridId = config.gridId || Ext.id();

        Ext.applyIf(config, {
            instances: {
                xtype: 'SimpleInstanceGridPanel',
                id: gridId,
                bufferSize: config.bufferSize,
                nearLimit: config.nearLimit,
                directFn: config.router.getInstances,
                nameDataIndex: config.nameDataIndex || "name",
                columns: config.columns,
                sm: config.sm,
                store: config.store,
                showProcessCount: config.showProcessCount
            }
        });
        this.callParent(arguments);
        this.gridId = gridId;
    },
    getInstancesGrid: function() {
        return Ext.getCmp(this.gridId);
    }

});

})();
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


(function(){

Ext.ns('Zenoss');

/**
 * @class Zenoss.ViewButton
 * @extends Ext.Button
 * A button that toggles between cards in a panel with a card layout.
 * @constructor
 */
Ext.define("Zenoss.ViewButton", {
    extend:"Ext.Button",
    alias: ['widget.ViewButton'],

    constructor: function(userConfig) {

        var baseConfig = {
            enableToggle: true,
            toggleGroup: 'CardButtonPanel',
            allowDepress: false
        };

        var config = Ext.apply(baseConfig, userConfig);
        Zenoss.ViewButton.superclass.constructor.call(this, config);
    }

});



/**
 * @class Zenoss.CardButtonPanel
 * @extends Ext.Button
 * A Panel with a card layout and toolbar buttons for switching between the
 * cards.
 * @constructor
 */
Ext.define("Zenoss.CardButtonPanel", {
    extend:"Ext.Panel",
    alias: ['widget.CardButtonPanel'],

    constructor: function(config) {
        // Inner secret closure function to create the handler
        function createToggleHandler(cardPanel, panel) {
            return function(button, pressed) {
                if (pressed) {
                    cardPanel.fireEvent('cardchange', panel);
                    cardPanel.getLayout().setActiveItem(panel.id);
                }
            };
        }

        function syncButtons(me) {
            var tb = me.getDockedItems('toolbar')[0];
            for (var idx=0; idx < me.items.getCount(); ++idx) {
                var newComponent = me.items.get(idx);

                if (newComponent instanceof Ext.Panel) {
                    tb.add({
                        xtype: 'ViewButton',
                        id: 'button_' + newComponent.id,
                        text: Ext.clean(newComponent.buttonTitle,
                                        newComponent.title, 'Undefined'),
                        pressed: (newComponent == me.layout.activeItem),
                        iconCls: newComponent.iconCls,
                        toggleHandler: createToggleHandler(me, newComponent)
                    });
                }
            }
        }

        function addButtons(me, newComponent, index) {
        }

        Ext.applyIf(config, {
            id: 'cardPanel',
            layout: 'card',
            activeItem: 0
        });

        Ext.apply(config, {
            header: false,
            tbar: [{
                xtype: 'tbtext',
                text: _t('View: ')
            }]
        });

        this.addEvents('cardchange');
        this.on('afterrender', syncButtons, this);
        this.listeners = config.listeners;
        Zenoss.CardButtonPanel.superclass.constructor.call(this, config);
    }
});



})();
/*****************************************************************************
 *
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 *
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 *
 ****************************************************************************/


(function(){

Ext.ns('Zenoss');


var oldActiveItem = Ext.layout.CardLayout.prototype.setActiveItem;
var oldInitEvents = Ext.layout.CardLayout.prototype.initEvents;

Ext.override(Ext.layout.CardLayout, {
    initEvents: function() {
        oldInitEvents.apply(this, arguments);
        this.owner.addEvents('cardchange');
    },
    setActiveItem: function(item) {
        oldActiveItem.apply(this, arguments);
        this.owner.fireEvent('cardchange', this.owner, item);
    }
});

Ext.define("Zenoss.ContextCardPanel", {
    extend:"Ext.Panel",
    alias: ['widget.contextcardpanel'],
    contextUid: null,
    constructor: function(config) {
        Ext.applyIf(config, {
            layout: {
                type: 'card',
                deferredRender: true
            }
        });
        Zenoss.ContextCardPanel.superclass.constructor.call(this, config);
        this.on('cardchange', this.cardChangeHandler, this);
    },
    setContext: function(uid) {
        this.contextUid = uid;
        this.cardChangeHandler(this.layout.activeItem);
    },
    cardChangeHandler: function(panel) {
        if (panel!=this && panel.setContext) {
            panel.setContext(this.contextUid);
        }
    }

});




})();
/*****************************************************************************
 *
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 *
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 *
 ****************************************************************************/


(function(){

var router, treeId, initTreeDialogs;

router = Zenoss.remote.TemplateRouter;
treeId = 'templateTree';



/**
 * The two default views
 **/
Ext.ns('Zenoss', 'Zenoss.templates');
Zenoss.templates.templateView = 'template';
Zenoss.templates.deviceClassView = 'deviceClass';


initTreeDialogs = function(tree) {

    new Zenoss.HideFormDialog({
        id: 'addTemplateDialog',
        title: _t('Add Monitoring Template'),
        items: {
            xtype: 'textfield',
            id: 'idTextfield',
            fieldLabel: _t('Name'),
            allowBlank: false
        },
        listeners: {
            'hide': function(treeDialog) {
                Ext.getCmp('idTextfield').setValue('');
            }
        },
        buttons: [
            {
                xtype: 'HideDialogButton',
                text: _t('Submit'),
                handler: function(button, event) {
                    var id = Ext.getCmp('idTextfield').getValue();
                    tree.addTemplate(id);
                }
            }, {
                xtype: 'HideDialogButton',
                text: _t('Cancel')
            }
        ]
    });

    new Zenoss.MessageDialog({
        id: 'deleteNodeDialog',
        title: _t('Delete Tree Node'),
        message: _t('The selected node will be deleted.'),
        okHandler: function(){
            tree.deleteTemplate();
        }
    });

};

Ext.ns('Zenoss');

/**
 * @class Zenoss.TemplateTreePanel
 * @extends Ext.tree.TreePanel
 * @constructor
 */
Ext.define("Zenoss.TemplateTreePanel", {
    alias: ['widget.TemplateTreePanel'],
    extend:"Zenoss.HierarchyTreePanel",

    constructor: function(config) {
        var currentView = config.currentView,
            directFn = router.getTemplates;
        if (currentView == Zenoss.templates.deviceClassView) {
            directFn = router.getDeviceClassTemplates;
        }
        this.currentView = currentView;

        Ext.applyIf(config, {
            id: treeId,
            rootVisible: false,
            autoScroll: true,
            containerScroll: true,
            useArrows: true,
            searchField: true,
            loadMask: true,
            router: router,
            cls: 'x-tree-noicon',
            idProperty: 'id',
            directFn: directFn,
            nodeName: 'Templates',
            root: {
                id: 'root',
                uid: '/zport/dmd/Devices',
                text: _t('Templates')
            }
        });

        this.callParent(arguments);
        initTreeDialogs(this);
        this.on('buttonClick', this.buttonClickHandler, this);
    },
    buttonClickHandler: function(buttonId) {
        switch(buttonId) {
            case 'addButton':
                Ext.getCmp('addTemplateDialog').show();
                break;
            case 'deleteButton':
                Ext.getCmp('deleteNodeDialog').show();
                break;
            default:
                break;
        }
    },

    addTemplate: function(id) {
        var rootNode, contextUid, params, tree, type;
        rootNode = this.getRootNode();
        contextUid = rootNode.data.uid;
        params = {contextUid: contextUid, id: id};
        tree = this;
        function callback(provider, response) {
            var result, nodeConfig, node, leaf;
            result = response.result;
            if (result.success) {
                nodeConfig = response.result.nodeConfig;
                node = tree.getLoader().createNode(nodeConfig);
                rootNode.appendChild(node);
                node.expand();
                leaf = node.childNodes[0];
                leaf.select();
            } else {
                Ext.Msg.alert('Error', result.msg);
            }
        }
        router.addTemplate(params, callback);
    },

    deleteTemplate: function() {
        var node, params, me;
        node = this.getSelectionModel().getSelectedNode();
        params = {uid: node.data.uid};
        me = this;
        function callback(provider, response) {
            me.getRootNode().reload();
        }
        router.deleteTemplate(params, callback);
    },

    createDeepLinkPath: function(node) {
        var path;
        if (this.currentView != Zenoss.templates.deviceClassView) {
            path = this.id + Ext.History.DELIMITER + node.data.uid;
        }else {
            path = this.id + Ext.History.DELIMITER + node.get("id");
        }

        return path;
    },
    onExpandnode: function(node) {
        // select the first template when the base URL is accessed without a
        // history token and without a filter value
        if ( ! this.searchField.getValue() && ! Ext.History.getToken() ) {
            if ( node === this.getRootNode() ) {
                node.childNodes[0].expand();
            } else {
                node.childNodes[0].select();
            }
        }
    },
    selectByToken: function(id) {
        if (this.currentView == Zenoss.templates.deviceClassView){
            this.callParent([unescape(id.replace(/\//g, '.'))]);
        }else{
            this.templateViewSelectByToken(id);
        }
    },
    getFilterFn: function(text) {
        if (this.currentView != Zenoss.templates.deviceClassView){
            var regex = new RegExp(Ext.String.escapeRegex(text),'i');
            var fn = function(item){
                return regex.test(item.get('id'));
            };
            return fn;
        }
        // match against the displayed text
        return this.callParent(arguments);
    },
    addHistoryToken: function(view, node) {
        Ext.History.add(this.id + Ext.History.DELIMITER + node.get('uid'));
    },
    templateViewSelectByToken: function(uid) {
        var root = this.getRootNode(),
            selNode = Ext.bind(function(){
                // Translates from the History token into the
                // path for the tree
                // for example this:
                //     "/zport/dmd/Devices/rrdTemplates/ethernetCsmacd"
                // turns into:
                //     "/root/ethernetCsmacd/ethernetCsmacd..Devices"
                var templateSplit, pathParts, nameParts,
                templateName, dmdPath, path, deviceName;

                if (uid.search('/rrdTemplates/') != -1) {
                    templateSplit = unescape(uid).split('/rrdTemplates/');
                    pathParts = templateSplit[0].split('/');
                    nameParts = templateSplit[1].split('/');
                    templateName = nameParts[0];
                }else{
                    // it is a template on a device
                    pathParts = uid.replace('/devices/', '/').split('/');
                    templateName = pathParts.pop();
                }

                if ( pathParts.length === 4 ) {
                    // Defined at devices, special case, include 'Devices'
                    dmdPath = 'Devices';
                } else {
                    // all the DeviceClass names under Devices separated by dots
                    dmdPath = pathParts.slice(4).join('.');
                }
                path = Ext.String.format('/root/{0}/{0}..{1}', templateName, dmdPath);
                this.selectPath(path);
            }, this);
        if (!root.isLoaded()) {
            // Listen on expand because if we listen on the store's load expand
            // gets double-called.
            root.on('expand', selNode, this, {single: true});
        } else {
            selNode();
        }

    },

    manualSelect: function(uid, templateName) {
        var theTree = this;
        var callback = function(success, foundNode) {
            if (!success) {
                theTree.getRootNode().eachChild(function(node) {
                    if (templateName == node.data.id){
                        node.eachChild(function(node){
                            if (uid == node.data.uid) {
                                node.select();
                                return false;
                            }
                        });
                        return false;
                    }
                });
            }
        };
        return callback;
    }

});



})();
/*****************************************************************************
 *
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 *
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 *
 ****************************************************************************/


/* package level */
(function() {

    var ZD = Ext.ns('Zenoss.devices');

    Ext.define("Zenoss.form.SmartCombo", {
        extend: "Ext.form.ComboBox",
        alias: ['widget.smartcombo'],
        constructor: function(config) {
            config = Ext.applyIf(config || {}, {
                queryMode: config.autoLoad !== false ? 'local':'remote',
                store: new Zenoss.NonPaginatedStore({
                    directFn: config.directFn,
                    root: config.root || 'data',
                    model: config.model || 'Zenoss.model.NameValue',
                    initialSortColumn: config.initialSortColumn || 'name'
                }),
                valueField: 'value',
                displayField: 'name',
                forceSelection: true,
                editable: false,
                autoSelect: true,
                selectOnFocus: false,
                triggerAction: 'all'
            });
            this.callParent([config]);
            if (this.autoLoad!==false) {
                this.getStore().load();
            }
        },
        getValue: function() {
            return this.callParent(arguments) || this.getRawValue();
        },
        getStore: function() {
            return this.store;
        }
    });

    Ext.define("Zenoss.model.ValueIntModel", {
        extend: 'Ext.data.Model',
        idProperty: 'name',
        fields: [
            { name: 'name', type: 'string'},
            { name: 'value', type: 'int'}
        ]
    });

    Ext.define("Zenoss.devices.PriorityCombo", {
        extend:"Zenoss.form.SmartCombo",
        alias: ['widget.PriorityCombo'],
        constructor: function(config) {
            config = Ext.apply(config || {}, {
                directFn: Zenoss.remote.DeviceRouter.getPriorities,
                cls: 'prioritycombo',
                model: 'Zenoss.model.ValueIntModel'

            });
            this.callParent([config]);
        },
        getValue: function() {
            // This method is being overridden because the check in SmartCombo
            // will not allow zero as a value; it will fallback and send the
            // raw value, which for Priority is the string "Trivial".
            var result = this.callParent(arguments);
            if (Ext.isString(result)) {
                Zenoss.env.initPriorities();
                Ext.each(Zenoss.env.PRIORITIES, function(item) {
                    if (item.name === result) {
                        result = item.value;
                        return false; // break
                    }
                });
            }
            return result;
        }
    });



    Ext.define("Zenoss.devices.DevicePriorityMultiselectMenu", {
        extend:"Zenoss.MultiselectMenu",
        alias: ['widget.multiselect-devicepriority'],
        constructor: function(config) {
            config = Ext.apply(config || {}, {
                text:'...',
                cls: 'x-btn x-btn-default-toolbar-small',
                source: Zenoss.env.priorities,
                defaultValues: []
            });
            ZD.DevicePriorityMultiselectMenu.superclass.constructor.call(this, config);
        }
    });


    Ext.define("Zenoss.devices.ProductionStateCombo", {
        extend:"Zenoss.form.SmartCombo",
        alias: ['widget.ProductionStateCombo'],
        constructor: function(config) {
            config = Ext.apply(config || {}, {
                directFn: Zenoss.remote.DeviceRouter.getProductionStates,
                model: 'Zenoss.model.ValueIntModel'
            });
            this.callParent([config]);
        }
    });



    Ext.define("Zenoss.devices.ProductionStateMultiselectMenu", {
        extend:"Zenoss.MultiselectMenu",
        alias: ['widget.multiselect-prodstate'],
        constructor: function(config) {
            var defaults = [];
            if (Ext.isDefined(Zenoss.env.PRODUCTION_STATES)) {
                defaults.Array = Ext.pluck(Zenoss.env.PRODUCTION_STATES, 'value');
            }
            config = Ext.apply(config || {}, {
                text:'...',
                cls: 'x-btn x-btn-default-toolbar-small',
                source: Zenoss.env.productionStates,
                defaultValues: defaults
            });
            this.callParent([config]);
        }
    });


    Ext.define("Zenoss.devices.ManufacturerDataStore", {
        extend:"Zenoss.NonPaginatedStore",
        constructor: function(config) {
            config = config || {};
            var router = config.router || Zenoss.remote.DeviceRouter;
            Ext.applyIf(config, {
                root: 'manufacturers',
                totalProperty: 'totalCount',
                initialSortColumn: 'name',
                model: 'Zenoss.model.Name',
                directFn: router.getManufacturerNames
            });
            this.callParent([config]);
        }
    });

    Ext.define("Zenoss.devices.OSProductDataStore", {
        extend:"Zenoss.NonPaginatedStore",
        constructor: function(config) {
            config = config || {};
            var router = config.router || Zenoss.remote.DeviceRouter;
            Ext.applyIf(config, {
                root: 'productNames',
                totalProperty: 'totalCount',
                model: 'Zenoss.model.Name',
                initialSortColumn: 'name',
                directFn: router.getOSProductNames
            });
            this.callParent([config]);
        }
    });

    Ext.define("Zenoss.devices.HWProductDataStore", {
        extend:"Zenoss.NonPaginatedStore",
        constructor: function(config) {
            config = config || {};
            var router = config.router || Zenoss.remote.DeviceRouter;
            Ext.applyIf(config, {
                root: 'productNames',
                totalProperty: 'totalCount',
                model: 'Zenoss.model.Name',
                initialSortColumn: 'name',
                directFn: router.getHardwareProductNames
            });
            this.callParent([config]);
        }
    });

    Ext.define("Zenoss.devices.ManufacturerCombo", {
        extend:"Zenoss.form.SmartCombo",
        alias: ['widget.manufacturercombo'],
        constructor: function(config) {
            var store = (config||{}).store || new ZD.ManufacturerDataStore();
            config = Ext.applyIf(config||{}, {
                store: store,
                width: 160,
                displayField: 'name',
                valueField: 'name'
            });
            this.callParent([config]);
        }
    });


    Ext.define("Zenoss.devices.ProductCombo", {
        extend:"Zenoss.form.SmartCombo",
        alias: ['widget.productcombo'],
        constructor: function(config) {
            var manufacturer = config.manufacturer || "",
                prodType = config.prodType || 'OS',
                store = (config||{}).store ||
                    prodType=='OS' ? new ZD.OSProductDataStore() : new ZD.HWProductDataStore();
            store.setBaseParam('manufacturer', manufacturer);
            config = Ext.applyIf(config||{}, {
                store: store,
                displayField: 'name',
                valueField: 'name',
                width: 160,
                queryMode: 'remote'
            });
            this.callParent([config]);
        }
    });

}());
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


(function(){

var router, dataSourcesId, graphsId, resetCombo,
    addMetricToGraph, showAddToGraphDialog, editDataSourcesId, treeId,
    dataSourceMenu, editingReSelectId;

Ext.ns('Zenoss');

router = Zenoss.remote.TemplateRouter;
dataSourcesId = 'dataSourceTreeGrid';
graphsId = 'graphGrid';
editDataSourcesId = "editDataSource";

// NOTE: this must match the tree id from the template.js file
treeId = 'templateTree';

/**
 *@returns the currently selected Data Source or Data Point, or none if nothing is selected
 **/
function getSelectedDataSourceOrPoint() {
    return Ext.getCmp(dataSourcesId).getSelectionModel().getSelectedNode();
}

resetCombo = function(combo, uid) {
    combo.clearValue();
    combo.getStore().setBaseParam('uid', uid);
    delete combo.lastQuery;
    combo.doQuery(combo.allQuery, true);
};

addMetricToGraph = function(dataPointUid, graphUid) {
    var params, callback;
    params = {dataPointUid: dataPointUid, graphUid: graphUid};
    callback = function(provider, response) {
        Ext.getCmp(graphsId).refresh();
    };
    router.addDataPointToGraph(params, callback);
};

Ext.define('Zenoss.GraphModel', {
    extend: 'Ext.data.Model',
    idProperty: 'uid',
    fields: [
        'uid', 'name', 'graphPoints', 'units', 'height', 'width',
             'sequence'
    ]
});

Ext.define("Zenoss.GraphStore", {
    extend:"Zenoss.NonPaginatedStore",
    alias: ['widget.graphstore'],
    constructor: function(config) {
        Ext.applyIf(config, {
            root: 'data',
            directFn: router.getGraphs,
            model: 'Zenoss.GraphModel'
        });
        this.callParent(arguments);
    }
});


showAddToGraphDialog = function() {
    var smTemplate, templateUid, smDataSource,
        nodeDataSource, metricName, html, combo;
    smTemplate = Ext.getCmp('templateTree').getSelectionModel();
    templateUid = smTemplate.getSelectedNode().data.uid;
    smDataSource = Ext.getCmp(dataSourcesId).getSelectionModel();
    nodeDataSource = smDataSource.getSelectedNode();
    if ( nodeDataSource && nodeDataSource.isLeaf() ) {
        metricName = nodeDataSource.data.name;
        html = '<div>Data Point</div>';
        html += '<div>' + metricName + '</div><br/>';

    Ext.create('Zenoss.dialog.BaseWindow', {
            id: 'addToGraphDialog',
            width: 400,
            height: 250,
            title: _t('Add Data Point to Graph'),
            items: [
            {
                xtype: 'panel',
                id: 'addToGraphMetricPanel'
            }, {
                xtype: 'combo',
                id: 'graphCombo',
                fieldLabel: _t('Graph'),
                displayField: 'name',
                valueField: 'uid',
                width:300,
                minChars: 999, // only do an all query
                resizeable: true,
                editable: false,
                emptyText: 'Select a graph...',
                store: new Zenoss.GraphStore({}),
                listeners: {select: function(){
                    Ext.getCmp('addToGraphDialog').submit.enable();
                }}
            }],
            buttons: [
            {
                xtype: 'DialogButton',
                ref: '../submit',
                text: _t('Submit'),
                disabled: true,
                handler: function(button, event) {
                    var node, datapointUid, graphUid;
                    node = Ext.getCmp(dataSourcesId).getSelectionModel().getSelectedNode();
                    datapointUid = node.data.uid;
                    graphUid = Ext.getCmp('graphCombo').getValue();
                    addMetricToGraph(datapointUid, graphUid);
                }
            }, {
                xtype: 'DialogButton',
                text: _t('Cancel')
            }]
        }).show();

        Ext.getCmp('addToGraphMetricPanel').body.update(html);
        combo = Ext.getCmp('graphCombo');
        resetCombo(combo, templateUid);
        Ext.getCmp('addToGraphDialog').submit.disable();
    } else {
        new Zenoss.dialog.ErrorDialog({message: _t('You must select a Data Point.')});
    }
};


/**********************************************************************
 *
 * Add Data Point
 *
 **/

/**
 * Causes the DataSources Grid to refresh from the server
 *
 **/
function refreshDataSourceGrid(selectedId) {
    var grid = Ext.getCmp(dataSourcesId);
    if (selectedId) {
        grid.refresh(function(){
            grid.getRootNode().cascade(function(node){
                if (node.data.id == selectedId) {
                    node.expand();
                    node.select();
                }
            });
        });
    }else{
        grid.refresh();
    }
}

/**
 * Gets the DataPoint name from the dialog and sends it to the server
 **/
function saveDataPoint() {
    var grid = Ext.getCmp(dataSourcesId),
        selectedNode = grid.getSelectionModel().getSelectedNode(),
        parameters, selectedId;

    // if we have a datapoint, find the datasource associated with it
    if (selectedNode.data.leaf) {
        selectedNode = selectedNode.parentNode;
    }

    parameters = {
        name: Ext.getCmp('metricName').getValue(),
        dataSourceUid: selectedNode.data.uid
    };
    selectedId = selectedNode.data.id;
    // get selected datasource, and reopen the grid to that point
    function callback() {
        refreshDataSourceGrid(selectedId);
    }
    return router.addDataPoint(parameters, callback);

}



/**
 * Displays the Add Data Point dialog and saves the inputted infomation
 * back to the server
 **/
function showAddDataPointDialog() {
    var grid = Ext.getCmp(dataSourcesId),
        selectedNode = grid.getSelectionModel().getSelectedNode();

    // make sure they selected a node
    if (!selectedNode) {
        new Zenoss.dialog.ErrorDialog({message: _t('You must select data source.')});
        return;
    }

    // display the name dialog
    /**
     * Add Data Point Dialog Configuration
     **/
    Ext.create('Zenoss.dialog.BaseWindow', {
        id: 'addDataPointDialog',
        title: _t('Add Data Point'),
        height: 160,
        width: 310,
        listeners: {
            hide: function() {
                Ext.getCmp('metricName').setValue(null);
                Ext.getCmp('metricName').clearInvalid();
            },
            validitychange: function(form, isValid) {
                Ext.getCmp('addDataPointDialog').query('DialogButton')[0].setDisabled(!isValid);
            }
        },
        items:{
            xtype: 'form',
            buttonAlign: 'left',
            items: [{
                xtype: 'idfield',
                id: 'metricName',
                fieldLabel: _t('Name'),
                allowBlank: false,
                blankText: _t('Name is a required field')
            }],
            buttons: [{
                xtype: 'DialogButton',
                text: _t('Submit'),
                formBind: true,
                handler: saveDataPoint
            },{
                xtype: 'DialogButton',
                text: _t('Cancel')
            }]
          }
        }).show();
}

/**********************************************************************
 *
 * Add Data Source
 *
 */

/**
 * Gets the info from the Add Datasource dialog and sends it to the server
 **/
function saveDataSource() {
    var grid = Ext.getCmp(treeId),
        selectedNode = grid.getSelectionModel().getSelectedNode(),
        parameters = {
            name: Ext.getCmp('dataSourceName').getValue(),
            type: Ext.getCmp('dataSourceTypeCombo').getValue(),
            templateUid: selectedNode.data.uid
        };
    return router.addDataSource(parameters, refreshDataSourceGrid);
}

/**
 * @class Zenoss.templates.DataSourceTypeModel
 * @extends Ext.data.Model
 *
 **/
Ext.define('Zenoss.templates.DataSourceTypeModel',  {
    extend: 'Ext.data.Model',
    idProperty: 'type',
    fields: [
        {name: 'type'}
    ]
});



/**
 * Shows the Add Data Source dialog and saves the inputted information
 * back to the server
 **/
function showAddDataSourceDialog() {
    var cmp = Ext.getCmp(treeId),
        selectedNode = cmp.getSelectionModel().getSelectedNode();

    // make sure they selected a node
    if (!selectedNode) {
        new Zenoss.dialog.ErrorDialog({message: _t('You must select a template.')});
        return;
    }
    // clear the entries (all of our forms are blank when you load them)
    Ext.create('Zenoss.dialog.BaseWindow', {
            id: 'addDataSourceDialog',
            title: _t('Add Data Source'),
            height: 180,
            width: 350,
            listeners: {
                hide: function() {
                    Ext.getCmp('dataSourceTypeCombo').setValue('SNMP');
                    Ext.getCmp('dataSourceName').setValue('');
                    Ext.getCmp('dataSourceName').clearInvalid();
                }

            },
            items:{
                xtype:'form',
                buttonAlign: 'left',
                listeners: {
                    validitychange: function(form, isValid) {
                        if (isValid) {
                            Ext.getCmp('addDataSourceDialog').query('button')[0].enable();
                        } else {
                            Ext.getCmp('addDataSourceDialog').query('button')[0].disable();
                        }
                    }
                },
                items:[{
                    xtype: 'idfield',
                    id: 'dataSourceName',
                    fieldLabel: _t('Name'),
                    allowBlank: false,
                    blankText: _t('Name is a required field')
                }, {
                    xtype: 'combo',
                    id: 'dataSourceTypeCombo',
                    allowBlank: false,
                    displayField: 'type',
                    fieldLabel: _t('Type'),
                    editable: false,
                    value: 'SNMP',
                    triggerAction: 'all',
                    store:  {
                        type: 'directcombo',
                        model: 'Zenoss.templates.DataSourceTypeModel',
                        root: 'data',
                        directFn: router.getDataSourceTypes
                    }
                }],
                buttons:[{
                    xtype: 'DialogButton',
                    disabled: true,
                    text: _t('Submit'),
                    handler: function() {
                        saveDataSource();
                    }
                },Zenoss.dialog.CANCEL
                ]
            }
    }).show();
}

/**********************************************************************
 *
 * Delete DataSource
 *
 */

/**
 * Creates the dynamic delete message and shows the dialog
 **/
function showDeleteDataSourceDialog() {
    var msg, name, html, dialog;
    if (getSelectedDataSourceOrPoint()) {
        // set up the custom delete message
        msg = _t("Are you sure you want to remove {0}? There is no undo.");
        name = getSelectedDataSourceOrPoint().data.name;
        html = Ext.String.format(msg, name);

        // show the dialog
        dialog = Ext.getCmp('deleteDataSourceDialog');
        dialog.setText(html);
        dialog.show();
    }else{
        new Zenoss.dialog.ErrorDialog({message: _t('You must select a Data Source or Data Point.')});
    }
}

new Zenoss.MessageDialog({
    id: 'deleteDataSourceDialog',
    title: _t('Delete'),
    // msg is generated dynamically
    okHandler: function(){
        var params, node = getSelectedDataSourceOrPoint(),
        selectedId;
        params = {
            uid: getSelectedDataSourceOrPoint().get("uid")
        };

        // data points are always leafs
        if (getSelectedDataSourceOrPoint().data.leaf) {
            selectedId = node.parentNode.data.id;
            function callback() {
                refreshDataSourceGrid(selectedId);
            }
            router.deleteDataPoint(params, callback);
        }else {
            router.deleteDataSource(params, refreshDataSourceGrid);
        }
    }
});

/**********************************************************************
 *
 * Edit DataSource/DataPoint
 *
 */

/**
 * Closes the edit dialog and updates the store of the datasources.
 * This is called after the router request to save the edit dialog
 **/
function closeEditDialog(response) {
    var dialog = Ext.getCmp(editDataSourcesId);
    refreshDataSourceGrid(editingReSelectId);

    // hide the dialog
    if (dialog) {
        dialog.hide();
    }
}

/**
 * Event handler for when a user wants to test a datasource
 * against a specific device.
 **/
function testDataSource() {
    var cmp = Ext.getCmp(editDataSourcesId),
        values = cmp.editForm.form.getValues(),
        win, testDevice, data;

    testDevice = values.testDevice;

    win = new Zenoss.CommandWindow({
        uids: testDevice,
        title: _t('Test Data Source'),
        data: values,
        target: values.uid + '/test_datasource'
    });

    win.show();
}

/**
 * Used when we save the data grid, it needs to
 * explicitly get the "Alias" value and turn it into a
 * list before going back to the server
 **/
function submitDataPointForm (values, callback) {
    // will always have only one alias form
    var aliases = Ext.getCmp(editDataSourcesId).query('alias'),
        alias;
    // assert that we have one exactly one alias form
    if (aliases.length < 1) {
        throw "The DataPoint form does not have an alias field, it should have only one";
    }

    alias = aliases[0];
    values.aliases = alias.getValue();
    router.setInfo(values, callback);
}

/**
 * Event handler for editing a specific datasource or
 * datapoint.
 **/
function editDataSourceOrPoint() {
    var cmp = Ext.getCmp(dataSourcesId),
        selectedNode = cmp.getSelectionModel().getSelectedNode(),
        data,
        isDataPoint = false,
        params, reselectId;

    // make sure they selected something
    if (!selectedNode) {
        new Zenoss.dialog.ErrorDialog({message: _t('You must select a Data Source or Data Point.')});
        return;
    }
    data = selectedNode.data;

    // find out if we are editing a datasource or a datapoint
    if (data.leaf) {
        isDataPoint = true;
        editingReSelectId = selectedNode.parentNode.data.id;
    }else{
        editingReSelectId = data.id;
    }

    // parameters for the router call
    params = {
        uid: data.uid
    };

    // callback for the router request
    function displayEditDialog(response) {
        var win,
        config = {};

        config.record = response.record;
        config.items = response.form;
        config.id = editDataSourcesId;
        config.isDataPoint = isDataPoint;
        config.title = _t('Edit Data Source');
        config.directFn = router.setInfo;
        config.width = 800;
        if (isDataPoint) {
            config.title = _t('Edit Data Point');
            config.directFn = submitDataPointForm;
            config.singleColumn = true;
        } else if (config.record.testable &&
                   Zenoss.Security.hasPermission('Change Device')){
            // add the test against device panel
            config.items.items.push({
                xtype:'panel',
                columnWidth: 0.5,
                baseCls: 'test-against-device',
                hidden: Zenoss.Security.doesNotHavePermission('Run Commands'),
                title: _t('Test Against a Device'),
                items:[{
                    xtype: 'textfield',
                    fieldLabel: _t('Device Name'),
                    id: 'testDevice',
                    width: 300,
                    name: 'testDevice'
                },{
                    xtype: 'hidden',
                    name: 'uid',
                    value: response.record.id
                },{
                    xtype: 'button',
                    text: _t('Test'),
                    id: 'testDeviceButton',
                    handler: testDataSource
                }]});

        }

        config.saveHandler = closeEditDialog;
        win = new Zenoss.form.DataSourceEditDialog(config);
        var cmdField = win.editForm.form.findField('commandTemplate');
        if (cmdField != null) {
            cmdField.addListener('dirtychange', function(form, isValid) {
                Ext.getCmp('testDeviceButton').disable();
                var devField = Ext.getCmp('testDevice');
                devField.setValue(_t("Save and reopen this dialog to test."));
                devField.disable();
            });
        }
        win.show();
    }
    // get the details
    if (isDataPoint) {
        router.getDataPointDetails(params, displayEditDialog);
    }else{
        router.getDataSourceDetails(params, displayEditDialog);
    }
}

dataSourceMenu = new Ext.menu.Menu({
    id: 'dataSourceMenu',
    items: [{
        xtype: 'menuitem',
        text: _t('Add Data Point To Graph'),
        disable: Zenoss.Security.doesNotHavePermission('Manage DMD'),
        handler: showAddToGraphDialog
    },{
        xtype: 'menuitem',
        text: _t('Add Data Point'),
        disable: Zenoss.Security.doesNotHavePermission('Manage DMD'),
        handler: showAddDataPointDialog
    },{
        xtype: 'menuitem',
        text: _t('View and Edit Details'),
        disable: Zenoss.Security.doesNotHavePermission('Manage DMD'),
        handler: editDataSourceOrPoint
    }]
});


/**
 * @class Zenoss.templates.DataSourceModel
 * @extends Ext.data.Model
 * Field definitions for the datasource/datapoint grid
 **/
Ext.define('Zenoss.templates.DataSourceModel',  {
    extend: 'Ext.data.Model',
    idProperty: 'uid',
    fields: [
        {name: 'uid'},
        {name: 'name'},
        {name: 'source'},
        {name: 'enabled'},
        {name: 'type'}
    ]
});

/**
 * @class Zenoss.templates.DataSourceStore
 * @extend Ext.data.TreeStore
 * Direct store for loading datasources and datapoints
 */
Ext.define("Zenoss.templates.DataSourceStore", {
    extend: "Ext.data.TreeStore",
    constructor: function(config) {
        config = config || {};
        Ext.applyIf(config, {
            model: 'Zenoss.templates.DataSourceModel',
            nodeParam: 'uid',
            remoteSort: false,
            proxy: {
                limitParam: undefined,
                startParam: undefined,
                pageParam: undefined,
                sortParam: undefined,
                type: 'direct',
                directFn: router.getDataSources,
                reader: {
                    root: 'data',
                    totalProperty: 'count'
                }
            }
        });
        this.callParent(arguments);
    }
});

/**
 * @class Zenoss.DataSourceTreeGrid
 * @extends Ext.Tree.Panel
 * @constructor
 */
Ext.define("Zenoss.DataSourceTreeGrid", {
    extend: "Ext.tree.Panel",
    alias: ['widget.DataSourceTreeGrid'],

    constructor: function(config) {
        Ext.applyIf(config, {
            useArrows: true,
            cls: 'x-tree-noicon',
            rootVisible: false,
            id: dataSourcesId,
            title: _t('Data Sources'),
            listeners: {
                // when they doubleclick we will open up the tree and
                // display the dialog
                beforeitemdblclick: editDataSourceOrPoint
            },
            store: Ext.create('Zenoss.templates.DataSourceStore', {}),
            tbar: [{
                    xtype: 'button',
                    iconCls: 'add',
                    id:'datasourceAddButton',
                    ref: '../addButton',
                    disabled: Zenoss.Security.doesNotHavePermission('Manage DMD'),
                    handler: showAddDataSourceDialog,
                    listeners: {
                        render: function() {
                            Zenoss.registerTooltipFor('datasourceAddButton');
                        }
                    }
            }, {
                xtype: 'button',
                iconCls: 'delete',
                ref: '../deleteButton',
                id: 'datasourceDeleteButton',
                disabled: Zenoss.Security.doesNotHavePermission('Manage DMD'),
                listeners: {
                    render: function() {
                        Zenoss.registerTooltipFor('datasourceDeleteButton');
                    }
                },
                handler: showDeleteDataSourceDialog
            },{
                xtype: 'button',
                id: 'datasourceEditButton',
                iconCls: 'customize',
                ref: '../customizeButton',
                disabled: Zenoss.Security.doesNotHavePermission('Manage DMD'),
                listeners: {
                    render: function() {
                        Zenoss.registerTooltipFor('datasourceEditButton');
                    }
                },
                menu: 'dataSourceMenu'
            }],
            columns: [{
                xtype: 'treecolumn', //this is so we know which column will show the tree
                text: 'Name',
                flex: 2,
                sortable: true,
                dataIndex: 'name'
            }, {
                dataIndex: 'source',
                flex: 1,
                header: 'Source',
                width: 250
            }, {
                dataIndex: 'enabled',
                header: 'Enabled',
                width: 60
            }, {
                dataIndex: 'type',
                header: 'Type',
                width: 90
            }],
            selModel: Ext.create('Zenoss.TreeSelectionModel', {
                mode: 'SINGLE'
            })
        });
        this.callParent(arguments);
    },
    disableToolBarButtons: function(bool) {
        this.addButton.setDisabled(bool && Zenoss.Security.hasPermission('Manage DMD'));
        this.deleteButton.setDisabled(bool && Zenoss.Security.hasPermission('Manage DMD'));
        this.customizeButton.setDisabled(bool && Zenoss.Security.hasPermission('Manage DMD'));
    },
    setContext: function(uid) {
        if (uid !== this.uid){
            this.uid = uid;
            this.refresh();
        }
    },
    refresh: function(callback, scope) {
        var root = this.getRootNode();
        root.setId(this.uid);
        root.data.uid = this.uid;
        root.uid = this.uid;
        if (callback) {
            this.getStore().load({
                callback: callback,
                scope: scope || this
            });
        }else {
            this.getStore().load();
        }

    }

});



})();
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


/* package level */
(function() {
    Ext.namespace('Zenoss.templates');
    /**********************************************************************
     *
     * Variable Declarations
     *
     */
    var router,
        treeId,
        dataSourcesId;

    Zenoss.templates.thresholdsId = 'thresholdGrid';
    dataSourcesId = 'dataSourceTreeGrid';
    router = Zenoss.remote.TemplateRouter;

    // The id of the tree on the left hand side of the screen
    treeId = 'templateTree';

    /**********************************************************************
     *
     * Add Threshold
     *
     */

    function addThreshold(data, grid){
        var uid,
            node,
            dataPoints,
            params,
            callback;
        uid = grid.getTemplateUid();
        if (Ext.getCmp(dataSourcesId)) {
            node = Ext.getCmp(dataSourcesId).getSelectionModel().getSelectedNode();
        }
        if ( node && node.isLeaf() ) {
            dataPoints = [node.data.uid];
        } else {
            dataPoints = [];
        }
        params = {
            uid: uid,
            thresholdType: data.thresholdTypeField,
            thresholdId: data.thresholdIdField,
            dataPoints: dataPoints
        };
        callback = function(provider, response) {
            grid.refresh();
        };
        Zenoss.remote.TemplateRouter.addThreshold(params, callback);
    }

    function showAddThresholdDialog(grid) {
        if (!grid.getTemplateUid()) {
            return;
        }
        var addThresholdDialog = Ext.create('Zenoss.dialog.BaseWindow', {
            id: 'addThresholdDialog',
            title: _t('Add Threshold'),
            message: _t('Allow the user to add a threshold.'),
            width: 295,
            height: 250,
            modal: true,
            padding: 10,
            listeners:{
                show: function() {
                    this.formPanel.getForm().reset();
                }
            },

            buttons: [{
                ref: '../submitButton',
                text: _t('Add'),
                disabled: true,
                xtype: 'DialogButton',
                handler: function(submitButton) {
                    var dialogWindow, basicForm;
                    dialogWindow = submitButton.refOwner;
                    basicForm = dialogWindow.formPanel.getForm();
                    addThreshold(basicForm.getValues(), grid);
                }
            }, {
                ref: '../cancelButton',
                text: _t('Cancel'),
                xtype: 'DialogButton'
            }],
            items: {
                xtype: 'form',
                ref: 'formPanel',
                height: 75,
                leftAlign: 'top',
                monitorValid: true,
                paramsAsHash: true,
                listeners: {
                    validitychange: function(formPanel, valid) {
                        addThresholdDialog.submitButton.setDisabled( !valid );
                    }
                },
                items: [{
                    name: 'thresholdIdField',
                    xtype: 'idfield',
                    fieldLabel: _t('Name'),
                     allowBlank: false
                },{
                    name: 'thresholdTypeField',
                    xtype: 'combo',
                    fieldLabel: _t('Type'),
                    displayField: 'type',
                    forceSelection: true,
                    triggerAction: 'all',
                    emptyText: _t('Select a type...'),
                    selectOnFocus: true,
                    allowBlank: false,
                    store: {
                        type: 'directcombo',
                        autoLoad: true,
                        directFn: Zenoss.remote.TemplateRouter.getThresholdTypes,
                        root: 'data',
                        fields: ['type']
                    }
                }]
            }});
        addThresholdDialog.show();
    }


     /**********************************************************************
     *
     * Edit Thresholds
     *
     */

    /**
     *@returns Zenoss.FormDialog Ext Dialog type associated with the
     *          selected threshold type
     **/
    function thresholdEdit(grid) {
        var record = grid.getSelectionModel().getSelected(),
            config = {};

        function displayEditDialog(response) {
            var win = Ext.create( 'Zenoss.form.DataSourceEditDialog', {
                record: response.record,
                items: response.form,
                singleColumn: true,
                width: 650,
                xtype: 'datasourceeditdialog',
                title: _t('Edit Threshold'),
                directFn: router.setInfo,
                id: 'editThresholdDialog',
                saveHandler: function(response) {
                    grid.refresh();
                    if (win) {
                        win.hide();
                    }
                }
            });

            win.show();
        }

        // send the request for all of the threshold's info to the server
        router.getThresholdDetails({uid: record.data.uid}, displayEditDialog);
    }


     /**********************************************************************
     *
     * Threshold Data Grid
     *
     */


    /**
     * @class Zenoss.thresholds.Model
     * @extends Ext.data.Model
     * Field definitions for the thresholds
     **/
    Ext.define('Zenoss.thresholds.Model',  {
        extend: 'Ext.data.Model',
        idProperty: 'uid',
        fields: ['name', 'type', 'dataPoints', 'severity', 'enabled','type', 'minval', 'maxval', 'uid']
    });

    /**
     * @class Zenoss.thresholds.Store
     * @extend Zenoss.DirectStore
     * Direct store for loading thresholds
     */
    Ext.define("Zenoss.thresholds.Store", {
        extend: "Zenoss.NonPaginatedStore",
        constructor: function(config) {
            config = config || {};
            Ext.applyIf(config, {
                model: 'Zenoss.thresholds.Model',
                directFn: router.getThresholds,
                root: 'data'
            });
            this.callParent(arguments);
        }
    });

    /**
     * Definition for the Thresholds datagrid. This is used in
     * templates.js in the updateThresholds function.
     **/
    Ext.define("Zenoss.templates.thresholdDataGrid", {
        alias:['widget.thresholddatagrid'],
        extend:"Zenoss.ContextGridPanel",

        constructor: function(config) {
            var listeners = {},
                me = this,
                tbarItems = config.tbarItems || [];

            listeners = Ext.apply(listeners, {
                itemdblclick: function(grid) {
                    thresholdEdit(grid);
                }
            });

            config = config || {};
            Ext.applyIf(config, {
                id: Zenoss.templates.thresholdsId,
                selModel:   new Zenoss.SingleRowSelectionModel ({
                    listeners : {
                        /**
                         * If they have permission and they select a row, show the
                         * edit and delete buttons
                         **/
                        select: function (selectionModel, rowIndex, record ) {
                            // enable the "Delete Threshold" button
                            if (Zenoss.Security.hasPermission('Manage DMD')) {
                                me.deleteButton.enable();
                                me.editButton.enable();
                            }
                        }
                    }
                }),
                title: _t('Thresholds'),
                store: Ext.create('Zenoss.thresholds.Store', { }),
                listeners: listeners,
                tbar: tbarItems.concat([{
                    xtype: 'button',
                    iconCls: 'add',
                    id: 'thresholdAddButton',
                    ref: '../addButton',
                    disabled: Zenoss.Security.doesNotHavePermission('Manage DMD'),
                    handler: function(btn) {
                        showAddThresholdDialog(btn.refOwner);
                    },
                    listeners: {
                        render: function() {
                            Zenoss.registerTooltipFor('thresholdAddButton');
                        }
                    }
                }, {
                    ref: '../deleteButton',
                    id: 'thresholdDeleteButton',
                    xtype: 'button',
                    iconCls: 'delete',
                    disabled: true,
                    handler: function(btn) {
                        var row = me.getSelectionModel().getSelected(),
                            uid,
                            params;
                        if (row){
                            uid = row.get("uid");
                            // show a confirmation
                     new Zenoss.dialog.SimpleMessageDialog({
                                title: _t('Delete Threshold'),
                                message: Ext.String.format(_t("Are you sure you want to delete this threshold? There is no undo.")),
                            buttons: [{
                                xtype: 'DialogButton',
                                text: _t('OK'),
                                handler: function() {
                                    params= {
                                        uid:uid
                                    };
                                    router.removeThreshold(params, function(){
                                        me.refresh();
                                        me.deleteButton.disable();
                                        me.editButton.disable();
                                    });
                                }
                            }, {
                                xtype: 'DialogButton',
                                text: _t('Cancel')
                            }]
                        }).show();
                        }
                    },
                    listeners: {
                        render: function() {
                            Zenoss.registerTooltipFor('thresholdDeleteButton');
                        }
                    }

                }, {
                    id: 'thresholdEditButton',
                    ref: '../editButton',
                    xtype: 'button',
                    iconCls: 'customize',
                    disabled: true,
                    handler: function(button) {
                        thresholdEdit(button.refOwner);
                    },
                    listeners: {
                        render: function() {
                            Zenoss.registerTooltipFor('thresholdEditButton');
                        }
                    }
                }]),
                columns: [{
                    dataIndex: 'name',
                    flex: 1,
                    header: _t('Name')
                }, {
                    dataIndex: 'type',
                    header: _t('Type')
                }, {
                    dataIndex: 'minval',
                    header: _t('Min. Value')
                }, {
                    dataIndex: 'maxval',
                    header: _t('Max. Value')
                }]
            });

            Zenoss.templates.thresholdDataGrid.superclass.constructor.apply(
                this, arguments);
        },
        getTemplateUid: function() {
            var tree = Ext.getCmp(treeId),
                node = tree.getSelectionModel().getSelectedNode();
            if (node) {
                return node.data.uid;
            }
        }
    });

}());
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


(function(){

var router, getSelectedTemplate, getSelectedGraphDefinition,
    addGraphDefinition, deleteGraphDefinition, addThresholdToGraph;


Ext.ns('Zenoss', 'Zenoss.templates');

router = Zenoss.remote.TemplateRouter;

getSelectedTemplate = function() {
    return Ext.getCmp('templateTree').getSelectionModel().getSelectedNode();
};

getSelectedGraphDefinition = function() {
    return Ext.getCmp('graphGrid').getSelectionModel().getSelected();
};

function getSelectedGraphPoint() {
    var cmp = Ext.getCmp('graphPointGrid');
    if (cmp) {
        return cmp.getSelectionModel().getSelected();
    }
    return null;
}



deleteGraphDefinition = function() {
    var params, callback;
    params = {
        uid: getSelectedGraphDefinition().get("uid")
    };
    callback = function(provider, response) {
        Ext.getCmp('deleteGraphDefinitionButton').disable();
        Ext.getCmp('graphDefinitionMenuButton').disable();
        Ext.getCmp('graphGrid').refresh();
    };
    router.deleteGraphDefinition(params, callback);
};


new Zenoss.MessageDialog({
    id: 'deleteGraphDefinitionDialog',
    title: _t('Delete Graph Definition'),
    // the message is generated dynamically
    okHandler: function(){
        deleteGraphDefinition();
    }
});

/**
 * Deletes the selected graph point
 **/
function deleteGraphPoint() {
    var params, callback;
    params = {
        uid: getSelectedGraphPoint().get("uid")
    };
    callback = function(provider, response) {
        Ext.getCmp('deleteGraphPointButton').disable();
        Ext.getCmp('editGraphPointButton').disable();
        Ext.getCmp('graphPointGrid').refresh();
    };
    router.deleteGraphPoint(params, callback);
}

new Zenoss.MessageDialog({
    id: 'deleteGraphPointDialog',
    title: _t('Delete Graph Point'),
    // the message is generated dynamically
    okHandler: deleteGraphPoint
});

/**
 * Adds the selected datapoint as a graph point to our
 * graph definition we are managing
 **/
function addDataPointToGraph() {
    var dataPointUid = Ext.getCmp('addDataPointToGraphDialog').comboBox.getValue(),
        graphUid = getSelectedGraphDefinition().get("uid"),
        includeThresholds = Ext.getCmp('addDataPointToGraphDialog').includeRelatedThresholds.getValue(),
        params = {
            dataPointUid: dataPointUid,
            graphUid: graphUid,
            includeThresholds: includeThresholds
        },
        callback = function() {
            Ext.getCmp('graphPointGrid').refresh();
        };
    router.addDataPointToGraph(params, callback);
}

new Zenoss.HideFormDialog({
    id: 'addDataPointToGraphDialog',
    title: _t('Add Data Point'),
    closeAction: 'hide',
    items:[{
        xtype: 'combo',
        ref: 'comboBox',
        getInnerTpl: function() {
            return '<tpl for="."><div ext:qtip="{name}" class="x-combo-list-item">{name}</div></tpl>';
        },
        fieldLabel: _t('Data Point'),
        valueField: 'uid',
        displayField: 'name',
        triggerAction: 'all',
        forceSelection: true,
        editable: false,
        allowBlank: false,
        listeners: {
            validitychange: function(form, isValid){
                var window = Ext.getCmp('addDataPointToGraphDialog');
                if (window.isVisible()){
                    window.submit.setDisabled(!isValid);
                }
            }
        },
        store: Ext.create('Zenoss.NonPaginatedStore', {
            root: 'data',
            model: 'Zenoss.model.Basic',
            directFn: router.getDataPoints
        })
    },{
        xtype: 'checkbox',
        name: 'include_related_thresholds',
        ref: 'includeRelatedThresholds',
        fieldLabel: _t('Include Related Thresholds'),
        checked: true
    }],
    listeners: {
        show: function() {
            var combo, uid;
            combo = Ext.getCmp('addDataPointToGraphDialog').comboBox;
            combo.reset();
            Ext.getCmp('addDataPointToGraphDialog').submit.disable();
            uid = getSelectedTemplate().data.uid;
            combo.store.setContext(uid);
        }
    },
    buttons: [
    {
        xtype: 'HideDialogButton',
        ui: 'dialog-dark',
        ref: '../submit',
        text: _t('Submit'),
        disabled: true,
        handler: function(button, event) {
            addDataPointToGraph();
        }
    }, {
        xtype: 'HideDialogButton',
        ui: 'dialog-dark',
        text: _t('Cancel')
    }]

});

addThresholdToGraph = function() {
    var params, callback;
    params = {
        graphUid: getSelectedGraphDefinition().get("uid"),
        thresholdUid: Ext.getCmp('addThresholdToGraphCombo').getValue()
    };
    callback = function() {
        Ext.getCmp('graphPointGrid').refresh();
    };
    router.addThresholdToGraph(params, callback);
};

new Zenoss.HideFormDialog({
    id: 'addThresholdToGraphDialog',
    title: _t('Add Threshold'),
    items: {
        xtype: 'combo',
        id: 'addThresholdToGraphCombo',
        getInnerTpl: function() {
            return '<tpl for="."><div ext:qtip="{name}" class="x-combo-list-item">{name}</div></tpl>';
        },
        fieldLabel: _t('Threshold'),
        valueField: 'uid',
        displayField: 'name',
        triggerAction: 'all',
        forceSelection: true,
        editable: false,
        allowBlank: false,
        listeners: {
            validitychange: function(form, isValid){
                var button = Ext.getCmp('addThresholdToGraphSubmit');
                if (button.isVisible()){
                    button.setDisabled(!isValid);
                }
            }
        },
        store: Ext.create('Zenoss.NonPaginatedStore', {
            root: 'data',
            model: 'Zenoss.model.Basic',
            directFn: router.getThresholds
        })
    },
    listeners: {
        show: function() {
            var combo, uid;
            combo = Ext.getCmp('addThresholdToGraphCombo');
            combo.reset();
            Ext.getCmp('addThresholdToGraphSubmit').disable();
            uid = getSelectedTemplate().data.uid;
            combo.store.setContext(uid);
        }
    },
    buttons: [
    {
        xtype: 'HideDialogButton',
        ui: 'dialog-dark',
        id: 'addThresholdToGraphSubmit',
        text: _t('Submit'),
        disabled: true,
        handler: function(button, event) {
            addThresholdToGraph();
        }
    }, {
        xtype: 'HideDialogButton',
        ui: 'dialog-dark',
        text: _t('Cancel')
    }]

});

Ext.define('Zenoss.InstructionTypeModel', {
    extend: 'Ext.data.Model',
    idProperty: 'pythonClassName',
    fields: ['pythonClassName', 'label']
});



new Zenoss.HideFormDialog({
    id: 'addCustomToGraphDialog',
    title: _t('Add Custom Graph Point'),
    listeners: {
        show: function(dialog) {
            dialog.addForm.idField.reset();
            dialog.addForm.typeCombo.reset();
            dialog.addForm.typeCombo.store.load();
        }
    },
    items: [{
        xtype: 'form',
        ref: 'addForm',
        listeners: {
            validitychange: function(formPanel, valid) {
                Ext.getCmp('addCustomToGraphDialog').submitButton.setDisabled( !valid );
            }
        },
        items: [{
            xtype: 'idfield',
            ref: 'idField',
            fieldLabel: _t('Name'),
            allowBlank: false
        }, {
            xtype: 'combo',
            ref: 'typeCombo',
            fieldLabel: _t('Instruction Type'),
            valueField: 'pythonClassName',
            displayField: 'label',
            triggerAction: 'all',
            forceSelection: true,
            editable: false,
            allowBlank: false,
            store: Ext.create('Zenoss.NonPaginatedStore', {
                root: 'data',
                autoLoad: false,
                model: 'Zenoss.InstructionTypeModel',
                directFn: router.getGraphInstructionTypes
            })
        }]
    }],
    buttons: [{
        xtype: 'HideDialogButton',
        ui: 'dialog-dark',
        disabled: true,
        ref: '../submitButton',
        text: _t('Add'),
        handler: function(addButton) {
            var params, callback, form = Ext.getCmp('addCustomToGraphDialog').addForm;
            params = {
                graphUid: getSelectedGraphDefinition().get("uid"),
                customId: form.idField.getValue(),
                customType: form.typeCombo.getValue()
            };
            callback = function() {
                Ext.getCmp('graphPointGrid').refresh();
            };
            router.addCustomToGraph(params, callback);
        }
    }, {
        xtype: 'HideDialogButton',
        ui: 'dialog-dark',
        ref: '../cancelButton',
        text: _t('Cancel')
    }]
});

/**********************************************************************
 *
 * Graph Custom Definition
 *
 */
Ext.create('Zenoss.dialog.BaseWindow', {
    title: _t('Graph Custom Definition'),
    id: 'graphCustomDefinitionDialog',
    closeAction: 'hide',
    buttonAlign: 'left',
    autoScroll: true,
    height: 500,
    width: 400,
    modal: true,
    plain: true,
    padding: 10,
    items: [{
        xtype:'form',
        ref: 'formPanel',
        paramsAsHash: true,
        api: {
            load: router.getGraphDefinition,
            submit: router.setInfo
        },
        items:[{
            xtype: 'label',
            fieldLabel: _t('Name'),
            name:'id',
            ref: 'nameLabel'
        },{
            xtype: 'textarea',
            fieldLabel: _t('Custom'),
            width: 300,
            height: 300,
            name: 'custom',
            ref: 'custom'
        },{
            xtype: 'label',
            fieldLabel: _t('Available RRD Variables'),
            ref: 'rrdVariables'
        }]
    }],
    buttons: [{
        xtype: 'HideDialogButton',
        ui: 'dialog-dark',
        text: _t('Submit'),
        handler: function(button, event) {
            var cmp = Ext.getCmp('graphCustomDefinitionDialog'),
                routerCallback,
                data = cmp.record,
                params = {};

            // we just need to update custom
            params.uid = data.uid;
            params.custom = cmp.formPanel.custom.getValue();

            router.setInfo(params);
        }
    }, {
        xtype: 'HideDialogButton',
        ui: 'dialog-dark',
        text: _t('Cancel')
    }],
    loadAndShow: function(uid) {
        this.uid = uid;
        this.formPanel.getForm().load({
            params: {uid:uid},
            success: function(btn, response) {
                var data = response.result.data;
                this.record = data;
                // populate the form
                this.formPanel.nameLabel.setText(data.id);
                this.formPanel.custom.setValue(data.custom);
                this.formPanel.rrdVariables.setText(data.rrdVariables.join('<br />'), false);

                this.show();
            },
            scope: this
        });
    }

});

/**
 * @class Zenoss.graph.GraphPointModel
 * @extends Ext.data.Model
 * Field definitions for the Graph Point
 **/
Ext.define('Zenoss.graph.GraphPointModel',  {
    extend: 'Ext.data.Model',
    idProperty: 'uid',
    fields: ['uid', 'name', 'type', 'description']
});

Ext.define("Zenoss.GraphPointStore", {
    alias:['widget.graphpointstore'],
    extend:"Zenoss.NonPaginatedStore",
    constructor: function(config){
        Ext.applyIf(config, {
            model: 'Zenoss.graph.GraphPointModel',
            directFn: router.getGraphPoints,
            root: 'data'
        });
        this.callParent(arguments);
    }
});


new Ext.menu.Menu({
    id: 'graphPointMenu',
    items: [{
        xtype: 'menuitem',
        text: _t('Data Point'),
        handler: function(){
            Ext.getCmp('addDataPointToGraphDialog').show();
        }
    }, {
        xtype: 'menuitem',
        text: _t('Threshold'),
        handler: function(){
            Ext.getCmp('addThresholdToGraphDialog').show();
        }
    }, {
        xtype: 'menuitem',
        text: _t('Custom Graph Point'),
        handler: function(){
            Ext.getCmp('addCustomToGraphDialog').show();
        }
    }]
});

Ext.define("Zenoss.BaseSequenceGrid", {
    extend:"Ext.grid.GridPanel",
    constructor: function(config){
        Ext.applyIf(config, {
            enableDragDrop   : true,
            viewConfig: {
                forcefit: true,
                plugins: {
                    ptype: 'gridviewdragdrop'
                }
            }
        });
        this.addEvents({'resequence': true});
        Zenoss.BaseSequenceGrid.superclass.constructor.call(this, config);
    }
});

Ext.define("Zenoss.GraphPointGrid", {
    alias:['widget.graphpointgrid'],
    extend:"Zenoss.ContextGridPanel",
    constructor: function(config){
        Ext.applyIf(config, {
            height: 215,
            viewConfig: {
                plugins: {
                    ptype: 'gridviewdragdrop'
                }
            },
            listeners: {
                /**
                 * The selection model was being ignored at this point so I used the
                 * row click.
                 **/
                itemclick: function() {
                    var record = getSelectedGraphPoint();
                    if (record) {
                        Ext.getCmp('deleteGraphPointButton').enable();
                        Ext.getCmp('editGraphPointButton').enable();
                    }else{
                        Ext.getCmp('deleteGraphPointButton').disable();
                        Ext.getCmp('editGraphPointButton').disable();
                    }
                },
                itemdblclick: displayGraphPointForm
            },
            store: Ext.create('Zenoss.GraphPointStore', {}),
            columns: [
                {dataIndex: 'name', header: _t('Name'), width: 150},
                {dataIndex: 'type', header: _t('Type'), width: 150},
                {
                    dataIndex: 'description',
                    header: _t('Description'),
                    id: 'definition_description',
                    flex: 1
                }
            ],
            tbar: [{
                xtype: 'button',
                id: 'addGraphPointButton',
                iconCls: 'add',
                menu: 'graphPointMenu',
                listeners: {
                    render: function() {
                        Zenoss.registerTooltipFor('addGraphPointButton');
                    }
                }
            }, {
                xtype: 'button',
                id: 'deleteGraphPointButton',
                iconCls: 'delete',
                disabled: true,
                listeners: {
                    render: function() {
                        Zenoss.registerTooltipFor('deleteGraphPointButton');
                    }
                },
                handler: function() {
                    var html, dialog;
                    // format the confimation message
                    html = _t("Are you sure you want to remove the graph point, {0}? There is no undo.");
                    html = Ext.String.format(html, getSelectedGraphPoint().data.name);

                    // show the dialog
                    dialog = Ext.getCmp('deleteGraphPointDialog');
                    dialog.setText(html);
                    dialog.show();
                }
            }, {
                xtype: 'button',
                id: 'editGraphPointButton',
                iconCls: 'customize',
                disabled: true,
                listeners: {
                    render: function() {
                        Zenoss.registerTooltipFor('editGraphPointButton');
                    }
                },
                handler: displayGraphPointForm
            }],
            selModel: Ext.create('Zenoss.SingleRowSelectionModel', {})
        });
        this.callParent(arguments);
    }
});


/**********************************************************************
 *
 * Graph Point Edit Dialog/Grid
 *
 */

function reloadGraphPoints() {
    var grid = Ext.getCmp('graphPointGrid');
    grid.refresh();
}

/**
 * Call back function from when a user selects a graph point.
 * This shows yet another dialog for editing a graph point
 **/
function displayGraphPointForm() {
    var record = getSelectedGraphPoint();

    function displayEditDialog(response) {
        var win = Ext.create('Zenoss.form.DataSourceEditDialog', {
            record: response.data,
            items: response.form,
            singleColumn: true,
            width: 400,
            title: _t('Edit Graph Point'),
            directFn: router.setInfo,
            id: 'editGraphPointDialog',
            saveHandler: reloadGraphPoints
        });

        win.show();
    }

    // remote call to get the object details
    router.getInfo({uid: record.get("uid")}, displayEditDialog);
}

new Zenoss.HideFitDialog({
    id: 'manageGraphPointsDialog',
    title: _t('Manage Graph Points'),
    items: [{
        xtype: 'graphpointgrid',
        id: 'graphPointGrid',
        ref: 'graphGrid'
    }],
    buttons: [
    {
        xtype: 'HideDialogButton',
        ui: 'dialog-dark',
        text: _t('Save'),
        handler: function(){
            if (Zenoss.Security.hasPermission('Manage DMD')) {
                var records, uids;
                records = Ext.getCmp('graphPointGrid').getStore().getRange();
                uids = Ext.Array.pluck(Ext.Array.pluck(records, 'data'), 'uid');
                router.setGraphPointSequence({'uids': uids});
            }
        }
    }, {
        xtype: 'HideDialogButton',
        ui: 'dialog-dark',
        text: _t('Cancel')
    }]
});

Ext.create('Zenoss.dialog.BaseWindow', {
    layout: 'fit',
    id: 'viewGraphDefinitionDialog',
    title: _t('View and Edit Graph Definition'),
    closeAction: 'hide',
    buttonAlign: 'left',
    autoScroll: true,
    plain: true,
    modal: true,
    width: 400,
    height: 500,
    padding: 10,
    buttons: [{
        ref: '../submitButton',
        xtype: 'HideDialogButton',
        ui: 'dialog-dark',
        text: _t('Submit'),
        disabled: Zenoss.Security.doesNotHavePermission('Manage DMD'),
        handler: function(submitButton){
            var dialogWindow, basicForm, params;
            dialogWindow = submitButton.refOwner;
            basicForm = dialogWindow.formPanel.getForm();
            params = Ext.applyIf(basicForm.getValues(), {
                uid: dialogWindow.uid,
                hasSummary: false,
                log: false,
                base: false
            });
            basicForm.api.submit(params, function() {
                Ext.getCmp('graphGrid').refresh();
            });
        }
    },{
        xtype: 'HideDialogButton',
        ref: '../cancelButton',
        ui: 'dialog-dark',
        text: 'Cancel'
    }],
    items: {
        xtype: 'form',
        ref: 'formPanel',
        autoScroll: true,
        paramsAsHash: true,
        api: {
            load: router.getGraphDefinition,
            submit: router.setGraphDefinition
        },
        listeners: {
            validitychange: function(formPanel, valid){
                var dialogWindow = Ext.getCmp('viewGraphDefinitionDialog');
                if (Zenoss.Security.hasPermission('Manage DMD')) {
                    dialogWindow.submitButton.setDisabled( ! valid );
                }
            },
            show: function(formPanel){
                formPanel.getForm().load();
            }
        },
        items: [{
            xtype: 'idfield',
            fieldLabel: _t('Name'),
            name: 'newId',
            allowBlank: false
        },{
            xtype: 'numberfield',
            fieldLabel: _t('Height'),
            name: 'height',
            minValue: 0
        },{
            xtype: 'numberfield',
            fieldLabel: _t('Width'),
            name: 'width',
            minValue: 0
        },{
            xtype: 'textfield',
            fieldLabel: _t('Units'),
            name: 'units'
        },{
            xtype: 'checkbox',
            fieldLabel: _t('Logarithmic Scale'),
            name: 'log'
        },{
            xtype: 'checkbox',
            fieldLabel: _t('Base 1024'),
            name: 'base'
        },{
            xtype: 'numberfield',
            fieldLabel: _t('Min Y'),
            name: 'miny'
        },{
            xtype: 'numberfield',
            fieldLabel: _t('Max Y'),
            name: 'maxy'
        },{
            xtype: 'checkbox',
            fieldLabel: _t('Has Summary'),
            name: 'hasSummary'
        }]
    },
    loadAndShow: function(uid) {
        this.uid = uid;
        this.formPanel.getForm().load({
            params: {uid:uid},
            success: function() {
                this.show();
            },
            scope: this
        });
    }
});

new Ext.menu.Menu({
    id: 'graphDefinitionMenu',
    items: [{
        xtype: 'menuitem',
        text: _t('Manage Graph Points'),
        handler: function(){
            var uid, grid;
            uid = getSelectedGraphDefinition().get("uid");
            Ext.getCmp('manageGraphPointsDialog').show();
            grid = Ext.getCmp('graphPointGrid');
            grid.setContext(uid);
        }
    }, {
        xtype: 'menuitem',
        text: _t('View and Edit Details'),
        handler: function(){
            var dialogWindow, uid;
            dialogWindow = Ext.getCmp('viewGraphDefinitionDialog');
            uid = getSelectedGraphDefinition().get("uid");
            dialogWindow.loadAndShow(uid);
        }
    },{
        xtype: 'menuitem',
        text: _t('Custom Graph Definition'),
        handler: function () {
            var win = Ext.getCmp('graphCustomDefinitionDialog'),
                uid = getSelectedGraphDefinition().get("uid");
            win.loadAndShow(uid);
        }
    },{
        xtype: 'menuitem',
        text: _t('Graph Commands'),
        handler: function () {
            var params = {
                uid: getSelectedGraphDefinition().get("uid")
            };

            router.getGraphDefinition(params, function (response) {
                Ext.MessageBox.show({
                    title: _t('Graph Commands'),
                    minWidth: 700,
                    msg: Ext.String.format('<pre>{0}</pre>', response.data.fakeGraphCommands),
                    buttons: Ext.MessageBox.OK
                });
            });
        }
    }]
});

Ext.define("Zenoss.templates.GraphGrid", {
    alias:['widget.graphgrid'],
    extend:"Zenoss.ContextGridPanel",
    constructor: function(config) {
        var me = this;
        Ext.applyIf(config, {
            title: _t('Graph Definitions'),
            store: Ext.create('Zenoss.GraphStore', {}),
            enableDragDrop   : true,
            viewConfig: {
                forcefit: true,
                plugins: {
                    ptype: 'gridviewdragdrop'
                },
                listeners: {
                    /**
                     * Updates the graph order when the user drags and drops them
                     **/
                    drop: function() {
                        var records, uids;
                        records = me.store.getRange();
                        uids = Ext.pluck(Ext.pluck(records, 'data'), 'uid');
                        router.setGraphDefinitionSequence({'uids': uids});
                    }
                }
            },
            listeners: {
                /**
                 * Double click to edit a graph definition
                 **/
                itemdblclick: function()  {
                    var dialogWindow, uid;
                    dialogWindow = Ext.getCmp('viewGraphDefinitionDialog');
                    uid = getSelectedGraphDefinition().get("uid");
                    dialogWindow.loadAndShow(uid);
                }

            },
            selModel: new Zenoss.SingleRowSelectionModel({
             listeners: {
                    select: function() {
                        if (Zenoss.Security.hasPermission('Manage DMD')){
                            Ext.getCmp('deleteGraphDefinitionButton').enable();
                            Ext.getCmp('graphDefinitionMenuButton').enable();
                        }
                    }
                }
            }),
            columns: [{dataIndex: 'name', header: _t('Name'), flex:1, width: 400}],

            tbar: [{
                id: 'addGraphDefinitionButton',
                xtype: 'button',
                iconCls: 'add',
                ref: '../addButton',
                disabled: Zenoss.Security.doesNotHavePermission('Manage DMD'),
                listeners: {
                    render: function() {
                        Zenoss.registerTooltipFor('addGraphDefinitionButton');
                    }
                },
                handler: function() {
                    var dialog = Ext.create('Zenoss.dialog.BaseWindow', {
                        title: _t('Add Graph Definition'),
                        buttonAlign: 'left',
                        autoScroll: true,
                        plain: true,
                        width: 300,
                        autoHeight: true,
                        modal: true,
                        padding: 10,
                        items: [{
                            xtype: 'form',
                            listeners: {
                                validitychange: function(formPanel, valid) {
                                    dialog.submitButton.setDisabled( !valid );
                                }
                            },
                            items: [
                                {
                                    xtype: 'idfield',
                                    id: 'graphDefinitionIdTextfield',
                                    fieldLabel: _t('Name'),
                                    allowBlank: false
                                }
                            ]

                        }],
                        buttons: [
                            {
                                xtype: 'DialogButton',
                                ref: '../submitButton',
                                disabled: true,
                                text: _t('Submit'),
                                handler: function() {
                                    var params, callback;
                                    params = {
                                        templateUid: getSelectedTemplate().data.uid,
                                        graphDefinitionId: Ext.getCmp('graphDefinitionIdTextfield').getValue()
                                    };
                                    callback = function(provider, response) {
                                        Ext.getCmp('graphGrid').refresh();
                                    };

                                    router.addGraphDefinition(params, callback);
                                }
                            }, {
                                xtype: 'DialogButton',
                                text: _t('Cancel')
                            }]
                    });
                    dialog.show();
                }
            }, {
                id: 'deleteGraphDefinitionButton',
                xtype: 'button',
                iconCls: 'delete',
                disabled: true,
                listeners: {
                    render: function() {
                        Zenoss.registerTooltipFor('deleteGraphDefinitionButton');
                    }
                },
                handler: function() {
                    var msg, name, html, dialog;
                    msg = _t("Are you sure you want to remove {0}? There is no undo.");
                    name = getSelectedGraphDefinition().data.name;
                    html = Ext.String.format(msg, name);
                    dialog = Ext.getCmp('deleteGraphDefinitionDialog');
                    dialog.setText(html);
                    dialog.show();
                }
            }, {
                id: 'graphDefinitionMenuButton',
                xtype: 'button',
                listeners: {
                    render: function() {
                        Zenoss.registerTooltipFor('graphDefinitionMenuButton');
                    }
                },
                iconCls: 'customize',
                menu: 'graphDefinitionMenu',
                disabled: true
            }]
        });
        this.callParent(arguments);
    }
});


})();
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


(function(){

Ext.ns('Zenoss', 'Zenoss.templates');

var REMOTE = Zenoss.remote.DeviceRouter;

/**
 * Updates the data store for the template tree. This will select the
 * first template when refreshed.
 **/
function refreshTemplateTree() {
    var cmp = Ext.getCmp('templateTree');
    if (cmp && cmp.isVisible()) {

        cmp.refresh(function() {
            // select the first node
            var root = cmp.getRootNode();

            if (root.firstChild) {
                cmp.getSelectionModel().select(root.firstChild);
            }
        });

    }
}

Ext.define("Zenoss.templates.Container", {
    alias:['widget.templatecontainer'],
    extend:"Ext.Panel",
    constructor: function(config) {
        Ext.applyIf(config, {
            layout: 'border',
            defaults: {
                split: true
            },
            items: [{
                xtype: 'DataSourceTreeGrid',
                id: 'dataSourceTreeGrid',
                region: 'center',
                ref: 'dataSourceTreeGrid',
                uid: config.uid,
                root: {
                    uid: config.uid,
                    id: config.uid
                }
            }, {
                xtype: 'panel',
                layout: 'border',
                region: 'east',
                width: '35%',
                defaults: {
                    split: true
                },
                items: [{
                    xtype: 'thresholddatagrid',
                    id: 'thresholdGrid',
                    ref: '../thresholdGrid',
                    region: 'north',
                    height: 300
                }, {
                    xtype: 'graphgrid',
                    id: 'graphGrid',
                    ref: '../graphGrid',
                    region: 'center'
                }]
            }]
        });
        Zenoss.templates.Container.superclass.constructor.call(this, config);
    },
    setContext: function(uid){
        this.updateTreeGrid(this.dataSourceTreeGrid, uid);
        this.updateGrid(this.thresholdGrid, uid);
        this.updateGrid(this.graphGrid, uid);
    },
    updateTreeGrid: function(treeGrid, uid){
        treeGrid.setContext(uid);
    },
    updateGrid: function(grid, uid) {
        grid.setContext(uid);
    }
});


Zenoss.BubblingSelectionModel = Ext.extend(Zenoss.TreeSelectionModel, {
    constructor: function(config) {
        Zenoss.BubblingSelectionModel.superclass.constructor.call(this, config);
        this.enableBubble('selectionchange');
        this.bubbleTarget = config.bubbleTarget;
    },
    getBubbleTarget: function() {
        return this.bubbleTarget;
    }
});

Zenoss.MonTemplateSelectionModel = Ext.extend(Zenoss.BubblingSelectionModel, {
    constructor: function(config) {
        Ext.applyIf(config, {
            listeners: {
                beforeselect: function(sm, node) {
                    return node.isLeaf();
                }
            }
        });
        Zenoss.MonTemplateSelectionModel.superclass.constructor.call(this, config);
    }
});


Ext.define('Zenoss.templates.TemplateTreeModel', {
    extend: 'Zenoss.model.Tree',
    fields: [ 'text', 'uid'],
    getId: function() {
        return this.get("uid");
    },
    proxy: {
        simpleSortMode: true,
        type: 'direct',
        directFn: REMOTE.getTemplates,
        paramOrder: ['uid']
    }
});

Ext.define("Zenoss.templates.MonTemplateTreePanel", {
    alias:['widget.montemplatetreepanel'],
    extend:"Ext.tree.TreePanel",
    constructor: function(config){

        // create the model
        Ext.applyIf(config, {
            useArrows: true,
            manageHeight: false,
            cls: 'x-tree-noicon',
            model: 'Zenoss.model.Tree',
            selModel: new Zenoss.MonTemplateSelectionModel({
                bubbleTarget: config.bubbleTarget
            }),
            store: Ext.create('Ext.data.TreeStore', {
                model: 'Zenoss.templates.TemplateTreeModel',
                nodeParam: 'uid'
            }),
            hideHeaders: true,
            columns: [{
                xtype: 'treecolumn',
                flex: 1,
                dataIndex: 'text'
            }],
            root: {
                text: _t('Monitoring Templates')
            }
        });

        this.callParent([config]);
    },
    initComponent: function(){
        this.callParent(arguments);
        this.getStore().on('load', function() {
            this.getRootNode().expand();
        }, this);
    },
    setContext: function(uid, callback, scope) {
        this.uid = uid;
        if ( uid.match('^/zport/dmd/Devices') ) {
            this.show();
            var root = this.getRootNode();
            if (root) {
                root.collapse();
                root.data.uid = uid;
                this.getStore().load({
                    callback: callback,
                    scope: scope
                });
            }
        } else {
            this.hide();
        }
    },
    onSelectionChange: function(nodes) {
        var detail, node, uid;
        if (nodes && nodes.length) {
            node = nodes[0];
            uid = node.get("id");
            detail = Ext.getCmp(this.initialConfig.detailPanelId);
            if ( ! detail.items.containsKey('montemplate') ) {
                detail.add({
                    xtype: 'templatecontainer',
                    id: 'montemplate',
                    ref: 'montemplate',
                    uid: uid
                });
            }
            detail.montemplate.setContext(uid);
            detail.getLayout().setActiveItem('montemplate');
        }
    },
    refresh: function(callback, scope) {
        this.setContext(this.uid, callback, scope);
    }
});


Ext.define("Zenoss.BindTemplatesItemSelector", {
    alias:['widget.bindtemplatesitemselector'],
    extend:"Ext.ux.form.ItemSelector",
        constructor: function(config) {
        Ext.applyIf(config, {
            imagePath: "/++resource++zenui/img/xtheme-zenoss/icon",
            drawUpIcon: false,
            drawDownIcon: false,
            drawTopIcon: false,
            drawBotIcon: false,
            displayField: 'name',
            width: 380,
            valueField: 'id',
            store:  Ext.create('Ext.data.ArrayStore', {
                data: [],
                model: 'Zenoss.model.IdName',
                sorters: [{
                    property: 'value'
                }]
            })
        });
        Zenoss.BindTemplatesItemSelector.superclass.constructor.apply(this, arguments);
    },
    setContext: function(uid) {
        REMOTE.getUnboundTemplates({uid: uid}, function(provider, response){
            var data = response.result.data;
            // stack the calls so we can make sure the store is setup correctly first
            REMOTE.getBoundTemplates({uid: uid}, function(provider, response){
                var results = [];
                Ext.each(response.result.data, function(row){
                    results.push(row[0]);
                    data.push(row);
                });
                this.store.loadData(data);
                this.bindStore(this.store);
                this.setValue(results);
            }, this);
        }, this);

    }
});


Ext.define("Zenoss.AddLocalTemplatesDialog", {
    alias:['widget.addlocaltemplatesdialog'],
    extend:"Zenoss.HideFitDialog",
    constructor: function(config){
        var me = this;
        Ext.applyIf(config, {
            title: _t('Add Local Template'),
            layout: 'anchor',
            items: [{
                xtype: 'form',
                ref: 'formPanel',
                listeners: {
                    validitychange: function(formPanel, valid) {
                        me.submitButton.setDisabled( ! valid );
                    }
                },
                items: [{
                    xtype: 'idfield',
                    fieldLabel: _t('Name'),
                    ref: 'templateName',
                    context: config.context
                }]
            }],
            listeners: {
                show: function() {
                    this.formPanel.templateName.setValue('');
                }

            },
            buttons: [
            {
                xtype: 'HideDialogButton',
                ui: 'dialog-dark',
                ref: '../submitButton',
                text: _t('Submit'),
                handler: function() {
                    var templateId = me.formPanel.templateName.getValue();

                    REMOTE.addLocalTemplate({
                       deviceUid: me.context,
                       templateId: templateId
                    }, refreshTemplateTree);
                }
            }, {
                xtype: 'HideDialogButton',
                ui: 'dialog-dark',
                text: _t('Cancel')
            }]
        });
        Zenoss.AddLocalTemplatesDialog.superclass.constructor.call(this, config);
    },
    setContext: function(uid) {
        this.context = uid;
    }
});


Ext.define("Zenoss.BindTemplatesDialog", {
    alias:['widget.bindtemplatesdialog'],
    extend:"Zenoss.HideFitDialog",
    constructor: function(config){
        var me = this;
        var itemId = Ext.id();

        Ext.applyIf(config, {
            width: 600,
            height: 400,
            title: _t('Bind Templates'),
            items: [{
                xtype: 'panel',
                width:  550,
                layout: 'column',
                defaults: {
                    columnWidth: 0.5
                },
                items: [{
                    xtype: 'label',
                    style: {'padding':'0 0 5px 7px'},
                    text: 'Available'
                },{
                    xtype: 'label',
                    style: {'padding':'0 0 5px 0'},
                    text: 'Selected'
                }]
            },{
                xtype: 'bindtemplatesitemselector',
                ref: 'itemselector',
                width:500,
                height:200,
                id: itemId,
                context: config.context
            }],
            listeners: {
                show: function() {
                    Ext.getCmp(itemId).setContext(this.context);
                }
            },
            buttons: [
            {
                xtype: 'HideDialogButton',
                ui: 'dialog-dark',
                text: _t('Save'),
                handler: function(){
                    var records, data, templateIds;
                    if (Zenoss.Security.hasPermission('Manage DMD')) {
                        templateIds = Ext.getCmp(itemId).getValue();
                        REMOTE.setBoundTemplates({
                            uid: me.context,
                            templateIds: templateIds
                        }, refreshTemplateTree);
                    }
                }
            }, {
                xtype: 'HideDialogButton',
                ui: 'dialog-dark',
                text: _t('Cancel')
            }]
        });
        Zenoss.BindTemplatesDialog.superclass.constructor.call(this, config);
    },
    setContext: function(uid) {
        this.context = uid;
    }
});


Ext.define("Zenoss.ResetTemplatesDialog", {
    alias:['widget.resettemplatesdialog'],
    extend:"Zenoss.MessageDialog",
    constructor: function(config) {
        var me = this;
        Ext.applyIf(config, {
            title: _t('Reset Template Bindings'),
            message: _t('Are you sure you want to delete all local template bindings and use default values?'),
            buttons: [
                {
                    xtype: 'HideDialogButton',
                    ui: 'dialog-dark',
                    text: _t('Reset Bindings'),
                    handler: function() {
                        if (Zenoss.Security.hasPermission('Manage DMD')) {
                            REMOTE.resetBoundTemplates(
                                { uid: me.context },
                                refreshTemplateTree);
                        }
                    }
                }, {
                    xtype: 'HideDialogButton',
                    ui: 'dialog-dark',
                    text: _t('Cancel')
                }
            ]
        });
        Zenoss.ResetTemplatesDialog.superclass.constructor.call(this, config);
    },
    setContext: function(uid) {
        this.context = uid;
    }
});



Ext.define("Zenoss.OverrideTemplatesDialog", {
    alias:['widget.overridetemplatesdialog'],
    extend:"Zenoss.HideFitDialog",
    constructor: function(config){
        var me = this;
        Ext.applyIf(config, {
            height: 200,
            width: 300,
            title: _t('Override Templates'),
            listeners: {
                show: function() {
                    // completely reload the combobox every time
                    // we show the dialog
                    me.submit.setDisabled(true);
                    me.comboBox.setValue(null);
                    me.comboBox.store.setBaseParam('query', me.context);
                    me.comboBox.store.setBaseParam('uid', me.context);

                }
            },
            items: [{
                xtype: 'label',
                html: _t('Select the bound template you wish to override.')
            },{
                xtype: 'combo',
                forceSelection: true,
                emptyText: _t('Select a template...'),
                minChars: 0,
                ref: 'comboBox',
                selectOnFocus: true,
                typeAhead: true,
                valueField: 'uid',
                displayField: 'label',
                listConfig: {
                    resizable: true
                },
                store: Ext.create('Zenoss.NonPaginatedStore', {
                    root: 'data',
                    model: 'Zenoss.model.Label',
                    directFn: REMOTE.getOverridableTemplates
                }),
                listeners: {
                    select: function(){
                        // disable submit if nothing is selected
                        me.submit.setDisabled(!me.comboBox.getValue());
                    }
                }
            }],
            buttons: [
            {
                xtype: 'HideDialogButton',
                ui: 'dialog-dark',
                ref: '../submit',
                disabled: true,
                text: _t('Submit'),
                handler: function(){
                    var records, data, templateIds;
                    if (Zenoss.Security.hasPermission('Manage DMD')) {
                        var templateUid = me.comboBox.getValue();
                        Zenoss.remote.TemplateRouter.copyTemplate({
                            uid: templateUid,
                            targetUid: me.context
                        }, refreshTemplateTree);
                    }
                }
            }, {
                xtype: 'HideDialogButton',
                ui: 'dialog-dark',
                text: _t('Cancel')
            }]
        });
        Zenoss.OverrideTemplatesDialog.superclass.constructor.call(this, config);
    },
    setContext: function(uid) {
        this.context = uid;
    }
});


Ext.define("Zenoss.removeLocalTemplateDialog", {
    alias:['widget.removelocaltemplatesdialog'],
    extend:"Zenoss.HideFitDialog",
    constructor: function(config){
        var me = this;
        Ext.applyIf(config, {
            height: 200,
            width: 300,
            title: _t('Remove Local Template'),
            listeners: {
                show: function() {
                    // completely reload the combobox every time
                    // we show the dialog
                    me.submit.setDisabled(true);
                    me.comboBox.setValue(null);
                    me.comboBox.store.setBaseParam('query', me.context);
                    me.comboBox.store.setBaseParam('uid', me.context);
                }
            },
            items: [{
                xtype: 'label',
                html: _t('Select the locally defined template you wish to remove.')
            },{
                xtype: 'combo',
                forceSelection: true,
                width: 200,
                emptyText: _t('Select a template...'),
                minChars: 0,
                ref: 'comboBox',
                selectOnFocus: true,
                valueField: 'uid',
                displayField: 'label',
                typeAhead: true,
                store: Ext.create('Zenoss.NonPaginatedStore', {
                    root: 'data',
                    model: 'Zenoss.model.Label',
                    directFn: REMOTE.getLocalTemplates
                }),
                listeners: {
                    select: function(){
                        // disable submit if nothing is selected
                        me.submit.setDisabled(!me.comboBox.getValue());
                    }
                }
            }],
            buttons: [
            {
                xtype: 'HideDialogButton',
                ui: 'dialog-dark',
                ref: '../submit',
                disabled: true,
                text: _t('Submit'),
                handler: function(){
                    var records, data, templateIds;
                    if (Zenoss.Security.hasPermission('Manage DMD')) {
                        var templateUid = me.comboBox.getValue();
                        REMOTE.removeLocalTemplate({
                            deviceUid: me.context,
                            templateUid: templateUid
                        }, refreshTemplateTree);
                    }
                }
            }, {
                xtype: 'HideDialogButton',
                ui: 'dialog-dark',
                text: _t('Cancel')
            }]
        });
        Zenoss.OverrideTemplatesDialog.superclass.constructor.call(this, config);
    },
    setContext: function(uid) {
        this.context = uid;
    }
});


})();
/*****************************************************************************
 *
 * Copyright (C) Zenoss, Inc. 2009, all rights reserved.
 *
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 *
 ****************************************************************************/


(function(){

Ext.ns('Zenoss');
function createClickHandler(bubbleTargetId) {
    return function(button, event) {
        Ext.getCmp(bubbleTargetId).fireEvent('buttonClick', button.id);
    };
}

// options comprises the following:
//      addToZenPack: true puts the Add To ZenPack icon in, default true
//      hasOrganizers: true puts the Add ___  Organizer in, default true
//      customAddDialog: config for a SmartFormDialog to override the default
//      deleteMenu: needs separate menu items for deleting organizers and items,
//                  works in conjunction with hasOrganizers
//      contextGetter: fetches the context UIDs for the specific page

Zenoss.footerHelper = function(itemName, footerBar, options) {
    var items;

    options = Ext.applyIf(options || {}, {
        addToZenPack: true,
        hasOrganizers: true,
        deleteMenu: true,
        hasContextMenu: true,
        customAddDialog: {},
        buttonContextMenu: {},
        contextGetter: null,
        onGetDeleteMessage: function (itemName) {
            return Ext.String.format(_t('The selected {0} will be deleted.'), itemName.toLowerCase());
        },
        onGetAddDialogItems: function () {
            return [{
                xtype: 'textfield',
                name: 'id',
                fieldLabel: _t('Name'),
                anchor: '80%',
                allowBlank: false
            }];
        },
        onGetItemName: function() {
            return itemName;
        }
    });

    Ext.applyIf(options.buttonContextMenu, {
        xtype: 'ContextMenu',
        tooltip: _t('Context-sensitive actions'),
        menu: {
            items: []
        },
        ref: 'buttonContextMenu'
    });

    footerBar = footerBar || Ext.getCmp('footer_bar');

    // For now, we will monkey-patch a setContext onto it.
    footerBar.setContext = function(contextUid) {
        Ext.each(this.items.items, function(i) {
            if (i.setContext) { i.setContext(contextUid); }
        });
    };


    function showAddDialog(template, event) {
        var handler, dialog, addDialogConfig;

        // Shallow copy config to avoid mangling the original config
        addDialogConfig = Ext.apply({}, options.customAddDialog);

        handler = function(values) {
            footerBar.fireEvent('buttonClick', event, values.id, values);
        };

        addDialogConfig = Ext.applyIf(addDialogConfig, {
            submitHandler: handler,
            items: options.onGetAddDialogItems(),
            title: Ext.String.format(template, options.onGetItemName())
        });

        dialog = new Zenoss.SmartFormDialog(addDialogConfig);
        dialog.show();

    }

    items = [
        {
            xtype: 'FlexButton',
            id: 'footer_add_button',
            iconCls: 'add',
            hidden: Zenoss.Security.doesNotHavePermission('Add DMD Objects'),
            tooltip: _t('Add a child to the selected organizer'),
            menu: {
                items: [
                    {
                        text: Ext.String.format(_t('Add {0}'), itemName),
                        listeners: {
                            click: Ext.pass(showAddDialog, ['Add {0}', 'addClass'])
                        }
                    }
                ]
            },
            ref: 'buttonAdd'
        },
        {
            xtype: 'FlexButton',
            id: 'footer_delete_button',
            iconCls: 'delete',
            hidden: Zenoss.Security.doesNotHavePermission('Delete objects'),
            tooltip: Ext.String.format(_t('Delete {0}'), itemName),
            menu: {
                items: [{

                    text: Ext.String.format(_t('Delete {0}'), options.onGetItemName()),
                    listeners: {
                        click: function() {
                            var itemName = options.onGetItemName();
                            new Zenoss.dialog.SimpleMessageDialog({
                                message: options.onGetDeleteMessage(itemName),
                                buttonAlign: 'center',
                                title: Ext.String.format(_t('Delete {0}'), options.onGetItemName()),
                                buttons: [{
                                    xtype: 'DialogButton',
                                    text: _t('OK'),
                                    handler: function(){
                                        footerBar.fireEvent('buttonClick', 'delete');
                                    }
                                }, {
                                    xtype: 'DialogButton',
                                    text: _t('Cancel')
                                }]
                            }).show();
                        }
                    }
                }]

            },
            ref: 'buttonDelete'
        }
    ];





    if (options.hasOrganizers)
    {
        // add button
        items[0].menu.items.push({
            text: Ext.String.format(_t('Add {0} Organizer'), itemName),
            param: 'addOrganizer',
            listeners: {
                click: Ext.pass(showAddDialog, [_t('Add {0} Organizer'), 'addOrganizer'])
            },
            ref: 'buttonAddOrganizer'
        });

        if (options.deleteMenu)
        {

            items[1].menu.items.push({
                text: Ext.String.format(_t('Delete {0} Organizer'), itemName),
                ref: 'buttonDeleteOrganizer',
                listeners: {
                    click: function() {
                        var itemName = options.onGetItemName();
                        Ext.MessageBox.show({
                            title: Ext.String.format(_t('Delete {0} Organizer'), itemName),
                            msg: Ext.String.format(_t('The selected {0} organizer will be deleted.'),
                                    itemName.toLowerCase()),
                            fn: function(buttonid){
                                if (buttonid=='ok') {
                                    footerBar.fireEvent('buttonClick', 'deleteOrganizer');
                                }
                            },
                            buttons: Ext.MessageBox.OKCANCEL
                        });
                    }
                }
            });
        }
    }

    if (options.addToZenPack) {
        options.buttonContextMenu.menu.items.push({
            ref: 'buttonAddToZenPack',
            text: Ext.String.format(_t('Add {0} to ZenPack'), itemName),
            listeners: {
                click: function() {
                    var addToZenPackDialog = new Zenoss.AddToZenPackWindow({});
                    var target = options.contextGetter.getUid();
                    if ( ! target ) {
                        return;
                    }
                    addToZenPackDialog.setTarget(target);
                    addToZenPackDialog.show();
                }
            }
        });

        if ( options.contextGetter.hasTwoControls() ) {

            options.buttonContextMenu.menu.items.push({
                ref: 'buttonAddOrganizerToZenPack',
                text: Ext.String.format(_t('Add {0} Organizer to ZenPack'), itemName),
                listeners: {
                    click: function() {
                        var addToZenPackDialog = new Zenoss.AddToZenPackWindow({});
                        var target = options.contextGetter.getOrganizerUid();
                        if ( ! target ) {
                            return;
                        }
                        addToZenPackDialog.setTarget(target);
                        addToZenPackDialog.show();
                    }
                }
            });

        }

    }

    if ( options.hasContextMenu || options.addToZenPack ) {
        items.push(' ');
        items.push(options.buttonContextMenu);
    }

    items.push('-');
    footerBar.add(items);

};

})();
(function(){

Ext.ns('Zenoss');

function makeIpAddress(val) {
    var octets = val.split('.');
    if(octets.length>4)
        return false;
    while(octets.length < 4) {
        octets.push('0');
    }
    for(var i=0;i<octets.length;i++) {
        var octet=parseInt(octets[i], 10);
        if (!octet && octet!==0) return false;
        try {
            if (octet>255) return false;
        } catch(e) {
            return false;
        }
        octets[i] = octet.toString();
    }
    return octets.join('.');
}

function count(of, s) {
    return of.split(s).length-1;
}

/**
 * @class Zenoss.IpAddressField
 * @extends Ext.form.TextField
 * @constructor
 */
Ext.define("Zenoss.IpAddressField", {
    alias:['widget.ipaddressfield'],
    extend:"Ext.form.TextField",
    constructor: function(config){
        config.maskRe = true;
        Zenoss.IpAddressField.superclass.constructor.call(this, config);
    },
    filterKeys: function(e, dom) {
        if(e.ctrlKey || e.isSpecialKey()){
            return;
        }
        e.stopEvent();
        var full, result, newoctet,
            cursor = dom.selectionStart,
            selend = dom.selectionEnd,
            beg = dom.value.substring(0, cursor),
            end = dom.value.substring(selend),
            s = String.fromCharCode(e.getCharCode());
        if (s=='.') {
            result = beg + end;
            cursor += end.indexOf('.');
            newoctet = end.split('.')[1];
            if (selend==cursor+1)
                cursor++;
            if(newoctet)
                dom.setSelectionRange(cursor+1, cursor+newoctet.length+1);
        } else {
            result = makeIpAddress(beg + s + end);
            if (result) {
                cursor++;
                dom.value = result;
                dom.setSelectionRange(cursor, cursor);
            }
        }
    }

}); // Ext.extend



})();
/*****************************************************************************
 *
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 *
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 *
 ****************************************************************************/


(function () {

    Ext.define("Zenoss.SlidingCardLayout", {
        extend:"Ext.layout.CardLayout",
        alias:['layout.slide'],
        sizeAllCards:true,
        setActiveItem:function (index) {
            var C = this.owner,
                B = C.body,
                card = C.getComponent(index),
                active = this.activeItem,
                activeIndex = Ext.Array.indexOf(C.items.items, active);
            if (card != active) {
                if (active) {
                    if (card) {
                        C.fireEvent('beforecardchange', C, card, index, active, activeIndex);
                        if (!card.rendered) {
                            this.renderItem(card, index, C.getLayoutTarget());
                        }
                        card.show();
                        if (card.doLayout && (this.layoutOnCardChange ||
                            !card.rendered)) {
                            card.doLayout();
                        }
                        var _done = 0;

                        function shiftsCallback() {
                            _done++;
                            if (_done == 2)
                                C.fireEvent('cardchange', C, card, index, active,
                                    activeIndex);
                        }

                        var x = B.getX(),
                            w = B.getWidth(),
                            s = [x - w, x + w],
                            cfg = {
                                duration:250,
                                easing:'ease',
                                opacity:0,
                                callback:shiftsCallback
                            };
                        card.el.setY(B.getY());
                        card.el.setX((activeIndex < index ? s[1] : s[0]));
                        active.el.shift(Ext.applyIf({
                            x:activeIndex < index ? s[0] : s[1]
                        }, cfg));
                        card.el.shift(Ext.applyIf({
                            x:x,
                            opacity:1
                        }, cfg));
                    }
                }
                this.activeItem = card;
                this.initLayout();
            }

        }

    });

    Ext.layout.container['slide'] = Zenoss.SlidingCardLayout;


    Ext.define("Zenoss.HorizontalSlidePanel", {
        alias:['widget.horizontalslide'],
        extend:"Ext.Panel",
        constructor:function (config) {
            this.headerText = Ext.create('Ext.toolbar.TextItem', {
                html:(config && config.text) ? config.text : ''
            });
            config = Ext.applyIf(config || {}, {
                cls:'subselect',
                layout:'slide',
                activeItem:0
            });
            var items = [];
            Ext.each(config.items, function (item, index) {
                var headerText = Ext.create('Ext.toolbar.TextItem', {
                    html:(item && item.text) ? item.text : ''
                });
                var navButton = Ext.create('Ext.Button', {
                    text:(item && item.buttonText) ? item.buttonText : '',
                    // make the button belong to the owner panel
                    ref:(item.buttonRef || 'navButton'),
                    cls:index ? 'toleft' : 'toright',
                    ui:'arrowslide',
                    handler:function () {
                        this.layout.setActiveItem(index ? 0 : 1);

                    },
                    scope:this
                }, this);
                this[item.buttonRef] = navButton;
                navButton.hide();
                items.push({
                    layout:'fit',
                    tbar:{
                        cls:'subselect-head',
                        height:37,
                        items:[headerText, '->', navButton]
                    },
                    items:[item],
                    listeners:{
                        render:function (card) {
                            card.card = card.items.items[0];
                            card.card.parentCard = card;
                            card.headerText = headerText;
                            card.navButton = navButton;
                            var setHeaderText = function (text, qtip) {
                                this.headerText.setText(text);
                                Ext.QuickTips.unregister(this.headerText);

                                if (qtip) {
                                    Ext.QuickTips.register({
                                        target:this.headerText,
                                        text:qtip
                                    });
                                }
                            };
                            var setButtonText = function (text) {
                                this.navButton.setText(text);
                            };
                            card.setHeaderText = Ext.bind(setHeaderText, card);
                            card.setButtonText = Ext.bind(setButtonText, card);
                        }
                    }
                });
            }, this);
            config.items = items;
            Zenoss.HorizontalSlidePanel.superclass.constructor.call(this, config);
        },
        initEvents:function () {
            this.addEvents('beforecardchange');
            this.addEvents('cardchange');
            Zenoss.HorizontalSlidePanel.superclass.initEvents.call(this);
        }
    });


    /**
     * A MixedCollection for nav configs.
     *
     * Each item in the config is a normal dictionary with an xtype. The xtype specified will be used for the display
     * when the item is clicked.
     *
     * Example item structure:
     *
     * {
     *     text: 'Menu label',
     *     id: 'View id',
     *     xtype: 'somextype', // optional, defaults to Panel
     *     filterNav: function(navTree) {
     *         // An optional function that is called to determine if this item should be shown
     *         // Use navTree.contextUid for the context.
     *         // return true to display the item or false to remove it
     *     }
     * }
     */
    Zenoss.NavConfig = Ext.extend(Ext.util.MixedCollection, {
        constructor:function () {
            Zenoss.NavConfig.superclass.constructor.call(this, true, function (item) {
                return item.id;
            });
        }
    });

    Zenoss.NavManager = Ext.extend(Object, {
        all:null,
        constructor:function () {
            this.all = new Zenoss.NavConfig();
            this.all.addEvents('navready');
        },
        /**
         * Register a nav item tree. See `Zenoss.NavConfig` for item structure.
         *
         * Zenoss.nav.register({
         *     DeviceGroup: [
         *         {
         *             id: 'device_grid',
         *             text: 'Devices',
         *             listeners: {
         *                 render: updateNavTextWithCount
         *             }
         *         },
         *         {
         *             id: 'events_grid',
         *             text: _t('Events')
         *         }
         *     ]
         * });
         *
         * @param navSpec
         */
        register:function (navSpec) {
            for (var type in navSpec) {
                this.add(type, navSpec[type]);
            }
        },
        /**
         * Adds a nav of `type` with its `items`. If a nav of `type` already exists, the items are appended.
         *
         * @param type Type of nav menu to add (ex: Device, DeviceGroup)
         * @param items An array of nav items. See `Zenoss.NavConfig` for item structure.
         */
        add:function (type, items) {
            if (!this.all.containsKey(type)) {
                // Create an empty nav container
                var newNav = new Zenoss.NavConfig();
                newNav.id = type;
                this.all.add(type, newNav);

                this.appendTo(type, items);

                this.all.fireEvent('navready', newNav);
            }
            else {
                this.appendTo(type, items);
            }
        },
        /**
         * Get a nav config if it exists.
         *
         * @param type
         */
        get:function (type) {
            return this.all.getByKey(type);
        },
        /**
         * Add menu nodes to the end of a nav config
         *
         * @param type Nav config type
         * @param items Array of items. See `Zenoss.NavConfig` for item structure.
         */
        appendTo:function (type, items) {
            if (this.all.containsKey(type)) {
                var nav = this.all.getByKey(type);
                nav.addAll(items);
            }
            else {
                this.onAvailable(type, function (item) {
                    item.addAll(items);
                });
            }
        },
        /**
         * Registers a callback to be called as soon as a nav tree matching navId is added.
         *
         * @param navId
         * @param callback
         */
        onAvailable:function (navId, callback, scope) {
            function onAdd(item) {
                if (item.id == navId) {
                    callback.call(scope || item, item);
                    this.all.un('navready', onAdd, scope);
                }
            }

            this.all.on('navready', onAdd, this);
        }
    });

    Zenoss.nav = new Zenoss.NavManager();

// Zenoss.SubselectionNodeUI = Ext.extend(Ext.tree.TreeNodeUI, {
//     render: function() {
//         Zenoss.SubselectionNodeUI.superclass.render.call(this);
//         Ext.removeNode(this.getIconEl());
//     }
// });

// Zenoss.SubselectionNode = Ext.extend(Ext.tree.TreeNode, {
//     constructor: function(config) {
//         Ext.applyIf(config, {
//             leaf: true,
//             uiProvider: Zenoss.SubselectionNodeUI
//         });
//         Zenoss.SubselectionNode.superclass.constructor.call(this, config);
//         this.addEvents('render');
//     },
//     render: function(bulkRender) {
//         Zenoss.SubselectionNode.superclass.render.call(this, bulkRender);
//         this.fireEvent('render', this);
//     }

// });

// Ext.tree.TreePanel.nodeTypes.subselect = Zenoss.SubselectionNode;


    Ext.define("Zenoss.SubselectionPanel", {
        alias:['widget.subselection'],
        extend:"Ext.Panel",
        constructor:function (config) {
            var id = config.id || Ext.id();
            Ext.applyIf(config, {
                id:id,
                layout:'fit',
                bodyStyle:{ 'margin-top':10 },
                items:[
                    {
                        xtype:'treepanel',
                        ref:'treepanel',
                        selModel:new Zenoss.TreeSelectionModel({
                            listeners:{
                                selectionchange:function (sm, node) {
                                    if (node) {
                                        var action = node.data.action;
                                        if (action) {
                                            if (Ext.isString(this.target)) {
                                                this.target = Ext.getCmp(this.target);
                                            }
                                            action.call(node, node, this.target);
                                        }
                                    }
                                },
                                scope:this
                            }
                        }),
                        id:'subselecttreepanel' + id,
                        rootVisible:false,
                        root:{nodeType:'node'}
                    }
                ]
            });
            Zenoss.SubselectionPanel.superclass.constructor.call(this, config);
        },
        initComponent:function () {
            Zenoss.SubselectionPanel.superclass.initComponent.call(this);
            this.treepanel = Ext.getCmp('subselecttreepanel' + this.id);
        },
        setContext:function (uid) {
            var type = Zenoss.types.type(uid),
                nodes = Zenoss.nav.get(type);
            if (nodes) {
                Zenoss.util.each(nodes, function (node) {
                    Ext.applyIf(node, {
                        nodeType:'subselect'
                    });
                });
                var root = new Ext.tree.AsyncTreeNode({
                    children:nodes,
                    listeners:{
                        load:function (node) {
                            var toselect = node.firstChild;
                            if (toselect) {
                                if (toselect.rendered) {
                                    toselect.select();
                                } else {
                                    toselect.on('render', function (node) {
                                        node.select();
                                    });
                                }
                            }
                        },
                        scope:this
                    }
                });
                this.treepanel.setRootNode(root);
            }
        }
    });

    Ext.define("Zenoss.DetailNavTreeModel", {
        extend:'Ext.data.Model',
        fields:Zenoss.model.BASE_TREE_FIELDS.concat([
            {
                name:'action',
                type:'function'
            }
        ])
    });

    Ext.define("Zenoss.DetailNavTreePanel", {
        alias:['widget.detailnavtreepanel'],
        extend:"Ext.tree.Panel",
        constructor:function (config) {
            Ext.applyIf(config, {
                store:Ext.create('Ext.data.TreeStore', {
                    model:'Zenoss.DetailNavTreeModel',
                    proxy:{
                        type:'memory',
                        reader:{
                            type:'json'
                        }
                    },
                    autoLoad:false
                }),
                useArrows:true,
                manageHeight: false,
                hideHeaders:true,
                columns:[
                    {
                        xtype:'treecolumn',
                        flex:1,
                        dataIndex:'text'
                    }
                ],
                selModel:new Zenoss.BubblingSelectionModel({
                    bubbleTarget:config.bubbleTarget
                }),
                id:'subselecttreepanel' + config.idSuffix,
                ref:'subselecttreepanel',
                rootVisible:false,
                iconCls:'x-tree-noicon',
                root:{nodeType:'node'}
            });
            this.callParent([config]);
        },
        setNodeVisible:function (node, visible) {
            if (Ext.isString(node)) {
                node = this.getNodeById(node);
            }
            var view = this.getView(),
                el = Ext.fly(view.getNodeByRecord(node));
            if (el) {
                el.setVisibilityMode(Ext.Element.DISPLAY);
                el.setVisible(visible);
            }
        }
    });


    /**
     * Used to manage and display detail navigation tree for a contextId
     *
     * @class Zenoss.DetailNavPanel
     * @extends Zenoss.SubselectionPanel
     */
    Ext.define("Zenoss.DetailNavPanel", {
        alias:['widget.detailnav'],
        extend:"Zenoss.SubselectionPanel",
        /**
         * @cfg {function} onGetNavConfig abstract function; hook to provide more nav items
         * @param {string} uid; item to get nav items for
         */
        onGetNavConfig:function (uid) {
            return [];
        },
        /**
         * Called when an item in detail nav is selected
         * @param {object} this, the DetailNavPanel
         * @param {object} the navigation node selected
         */
        onSelectionChange:Ext.emptyFn,
        /**
         * Filter out from being in the detail nav; used to filter out nav nodes
         * and the content panels. Return true if it should be kept, false otherwise
         * @param {DetailNavPanel}
            * @param {Object} config
         */
        filterNav:function (detailNav, config) {
            return true;
        },
        /**
         * The object id for which the detail navigation belongs to
         */
        contextId:null,
        /**
         * Menu ids used to get non dialog menus to be used in navigation;
         * Empty or null if no nav from old menu items is desired
         */
        menuIds:['More', 'Manage', 'Edit', 'Actions', 'Add', 'TopLevel'],
        /**
         * map of nav id to panel configuration
         */
        loaded:false,
        panelConfigMap:null,
        selectFirstNode:true,
        constructor:function (config) {
            Ext.applyIf(config, {
                id:Ext.id(),
                bodyCls:'detailnav',
                layout:'fit',
                bodyStyle:{ 'margin-top':10 }
            });
            // call second applyIf so config.id is set correctly
            Ext.applyIf(config, {
                items:{
                    xtype:'detailnavtreepanel',
                    ref:'navtreepanel',
                    idSuffix:config.id,
                    bubbleTarget:config.bubbleTarget
                }
            });
            Zenoss.DetailNavPanel.superclass.constructor.call(this, config);
        },
        initEvents:function () {
            this.addEvents(
                /**
                 * @event navloaded
                 * Fires after the navigation has been loaded
                 * @param {DetailNavPanel} this The DetailNavPanel
                 * @param {AsyncTreeNode} root The root node
                 */
                'navloaded',
                /*
                 * @event nodeloaded
                 * Fires after each navigation node has been loaded
                 * @param {DetailNavPanel} this The DetailNavPanel
                 * @param {Object} The Navigation config loaded
                 */
                'nodeloaded',
                /**
                 * @event contextchange
                 * Fires after the navigation has been loaded
                 * @param {DetailNavPanel} this The DetailNavPanel
                 */
                'contextchange'
            );
            Zenoss.DetailNavPanel.superclass.initEvents.call(this);
            if (this.selectFirstNode) {
                this.on('navloaded', this.selectFirst, this);
            }
        },
        setContext:function (uid) {
            //called to load the nav tree
            this.loaded = false;
            this.contextId = uid;
            this.treepanel.setRootNode([]);
            this.getNavConfig(uid);
            this.fireEvent('contextchange', this);
        },
        getSelectionModel:function () {
            return this.treepanel.getSelectionModel();
        },
        getNavConfig:function (uid) {
            //Direct call to get nav configs from server
            var me = this;
            var myCallback = function (provider, response) {
                var detailConfigs = response.result.detailConfigs;

                var filterFn = function (val) {
                    var show = true;
                    if (Ext.isFunction(val.filterNav)) {
                        show = val.filterNav(me);
                    }

                    return show && me.filterNav(me, val);
                };

                detailConfigs = Zenoss.util.filter(detailConfigs, filterFn, me);
                var nodes = me.onGetNavConfig(me.contextId);
                if (!Ext.isDefined(nodes) || nodes === null) {
                    nodes = [];
                }

                nodes = Zenoss.util.filter(nodes, filterFn, me);

                if (detailConfigs) {
                    nodes = nodes.concat(detailConfigs);
                }

                me.panelConfigMap = [];
                Zenoss.util.each(nodes, function (val) {
                    me.panelConfigMap[val.id] = val;
                });

                me.setNavTree(nodes);
            };
            var args = {
                'uid':uid
            };
            if (this.menuIds !== null && this.menuIds.length >= 1) {
                args['menuIds'] = this.menuIds;
            }
            if (Zenoss.env.lefthandnav) {
                myCallback(null, {
                    result:Zenoss.env.lefthandnav
                });
                delete Zenoss.env.lefthandnav;
            } else {
                Zenoss.remote.DetailNavRouter.getDetailNavConfigs(args, myCallback, this);
            }

        },
        reset:function () {
            return this.treepanel.setRootNode({});
        },
        selectFirst:function (me, root) {
            var sel = me.getSelectionModel().getSelectedNode(),
                token = Ext.History.getToken(),
                firstToken = me.id + Ext.History.DELIMITER + root.firstChild.id;
            if (!sel) {
                if (!token || (token && token == firstToken)) {
                    me.getSelectionModel().select(root.firstChild);
                }
            }
        },
        /**
         * Set the nodes to display in the nav tree.
         * @param nodes Zenoss.NavConfig Nodes to set the nav to
         */
        setNavTree:function (nodes) {
            //get any configs registered by the page
            var root;
            if (nodes) {
                root = this.treepanel.getRootNode();
                Zenoss.util.each(nodes, function (node) {
                    Ext.applyIf(node, {
                        nodeType:'subselect',
                        leaf:true
                    });
                    root.appendChild(node);
                });

                // Send an alert for all nodes after all nodes have been loaded
                Zenoss.util.each(nodes, function (navConfig) {
                    this.fireEvent('nodeloaded', this, navConfig);
                }, this);

            }
            this.loaded = true;
            this.fireEvent('navloaded', this, root);

            root.expand(false, function(){
                if (this.manualAdjustHeight) {
                    //HACK: cheat to make sure that all nodes are visible
                    var view = this.treepanel.getView();
                    var height = Ext.fly(view.getNode(0)).getHeight();
                    this.setHeight((height * nodes.length) + 35);
                }
            }, this);
            this.doLayout();


        }
    });


    Ext.define("Zenoss.DetailNavCombo", {
        alias:['widget.detailnavcombo'],
        extend:"Ext.form.ComboBox",
        target:null,
        contextUid:null,
        lastSelItem:null,
        panelConfigMap:null,
        queryMode:'local',
        editable:false,
        forceSelection:true,
        typeAhead:false,
        triggerAction:'all',
        filterNav:function (config) {
            return true;
        },
        menuIds:['More', 'Manage', 'Edit', 'Actions', 'Add', 'TopLevel'],
        onSelectionChange:Ext.emptyFn,
        onGetNavConfig:function (uid) {
            return [];
        },
        constructor:function (config) {
            Ext.applyIf(config, {
                store:new Ext.data.ArrayStore({
                    'id':0,
                    model: 'Zenoss.model.ValueText',
                    autoDestroy:true
                })
            });
            this.callParent(arguments);
        },
        getTarget:function () {
            var target = this.target;
            return Ext.isString(target) ? Ext.getCmp(target) : target;
        },
        initEvents:function () {
            Zenoss.DetailNavCombo.superclass.initEvents.call(this);
            this.on('select', this.onItemSelected, this);
        },
        onItemSelected:function (me, item) {
            var item = item[0],
                target = this.getTarget(),
                id = item.get('value'),
                config = this.panelConfigMap[id],
                action = config.action || function (node, target) {
                    if (!(id in target.items.map)) {
                        if (config) {
                            target.add(config);
                            target.doLayout();
                        }
                    }
                    target.items.map[id].setContext(this.contextUid);
                    target.layout.setActiveItem(id);
                };
            this.lastSelItem = item;
            action.call(this, item, target, this);
        },
        selectAt:function (idx) {
            var record = this.store.getAt(idx || 0);
            this.selectByItem(record);
        },
        selectByItem:function (item) {
            var lastItem = this.lastSelItem;
            this.lastSelItem = item || this.store.getAt(0);
            this.select(this.lastSelItem);
            this.fireEvent('select', this, [this.lastSelItem]);
        },
        setContext:function (uid) {
            this.contextUid = uid;
            var args = {uid:uid};
            if (!Ext.isEmpty(this.menuIds)) {
                args.menuIds = this.menuIds;
            }

            Zenoss.remote.DetailNavRouter.getDetailNavConfigs(args, function (r) {
                var detailConfigs = r.detailConfigs,
                    items = [],
                    nodes = [],
                    lastSelItem = this.lastSelItem,
                    hasItem = false,
                    panelMap = {};
                var filterFn = function (val) {
                    var show = true;
                    if (Ext.isFunction(val.filterNav)) {
                        show = val.filterNav(this);
                    }

                    return show && this.filterNav(val);
                };

                nodes = this.onGetNavConfig(uid);
                nodes = Zenoss.util.filter(nodes, filterFn, this);

                detailConfigs = Zenoss.util.filter(detailConfigs, filterFn, this);

                nodes = nodes.concat(detailConfigs);

                Ext.each(nodes, function (cfg) {
                    items.push([cfg.id, cfg.text]);
                    panelMap[cfg.id] = cfg;
                    // when switching component types we need to make sure
                    // that they share a common menu item
                    if (lastSelItem && cfg.id == lastSelItem.getId()) {
                        hasItem = true;
                    }
                });

                this.panelConfigMap = panelMap;
                this.store = new Ext.data.ArrayStore({
                    'id':0,
                    model: 'Zenoss.model.ValueText',
                    data:items,
                    autoDestroy:true
                });
                this.valueField = 'value';
                this.displayField = 'text';
                this.list = null;
                this.bindStore(this.store);
                this.doComponentLayout();
                // "sticky" menu selection, show same item as was shown for last context
                if (hasItem) {
                    this.selectByItem(this.lastSelItem);
                } else {
                    this.selectAt(0);
                }
            }, this);
        }
    });


    Ext.define("Zenoss.DetailContainer", {
        alias:['widget.detailcontainer'],
        extend:"Ext.Container",
        constructor:function (config) {
            Ext.applyIf(config, {
                autoScroll:true,
                listeners:{
                    selectionchange:this.onSelectionChange,
                    scope:this
                }
            });
            Ext.each(config.items, function (item) {
                item.bubbleTarget = this;
            }, this);
            this.callParent(arguments);
        },
        setContext:function (uid) {
            this.items.each(function (item) {
                item.setContext(uid);
            });
        },

        /**
         *  When used in devdetail.js, there will be two separate trees in here.
         *  So we need to handle the times that the user first selected
         *  something from one tree and then selected something from the other tree.
         *  We need to deselect the other tree nicely.
         * @param eventSelModel
         * @param node    should be the node that just got SELECTED.
         */
        onSelectionChange:function (eventSelModel, node) {
            var itemSelModel;
            // if node is empty then stuff just got deselected
            // from a tree, and there is nothing to do here when that happens
            if (node.length > 0) {
                this.items.each(function (item) {
                    itemSelModel = item.getSelectionModel();
                    if (itemSelModel === eventSelModel) {
                        item.onSelectionChange(node);
                    } else {
                        itemSelModel.deselectAll();
                    }
                });
            }
        }
    });


})();
/*****************************************************************************
 *
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 *
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 *
 ****************************************************************************/


(function(){

Ext.define("Zenoss.IFramePanel", {
    alias:['widget.iframe'],
    extend:"Ext.ux.IFrame",
    frameLoaded: false,
    testEarlyReadiness: false,
    constructor: function(config) {
        config = Ext.applyIf(config || {}, {
            timeout: 5000, // Wait 5s for iframe to initialize before failing
            pollInterval: 50,
            loadMask: _t('Loading...'),
            src: config.url || 'about:blank',
            ignoreClassName: false
        });
        Zenoss.IFramePanel.superclass.constructor.call(this, config);

    },
    initComponent: function(){
        this.callParent(arguments);
        this.addEvents('frameload', 'framefailed', 'isReady');
        this.on('frameload', function(win) {
            // Load any messages that may have been created by the frame
            Zenoss.messenger.checkMessages();
        }, this);
    },
    onRender: function(ct, position) {
        Zenoss.IFramePanel.superclass.onRender.apply(this, arguments);
        // Hook up load events
        this.frame = this.getEl();
        this.waitForLoad();
    },
    afterRender: function(container) {
        Zenoss.IFramePanel.superclass.afterRender.apply(this, arguments);
        if (!this.ownerCt) {
            var pos = this.getPosition(),
                size = this.frame.parent().getViewSize();
            this.setSize(size.width - pos[0], size.height-pos[1]);
        }
    },

    waitForLoad: function() {
        var doc = this.getDocument(),
            currentUrl = doc ? doc.location.href : null,
            ready = false,
            readyTooEarly = this.testEarlyReadiness,
            body, dom, href,
            i = 0,
            timestocheck = this.timeout / this.pollInterval;
        Ext.bind(function do_check() {
            if (this.frameLoaded) {
                return;
            }
            body = this.getBody();
            if (currentUrl == 'about:blank' || currentUrl == '') {
                // if an iframe is reused, it could have a body and
                // className immediately, but not the desired ones.
                // in that case, poll until the ready test fails,
                // then again until it succeeds.
                if (readyTooEarly) {
                    readyTooEarly = !!body
                            && (this.ignoreClassName || !!body.className);
                } else {
                    ready = !!body
                            && (this.ignoreClassName || !!body.className);

                    // Allow subclasses and clients defined when the panel is ready
                    ready = ready && this.fireEvent('isReady', this.getWindow());
                }
            } else {
                dom = body ? body.dom : null;
                href = this.getDocument().location.href;
                ready = href != currentUrl || (dom && dom.innerHTML);

                // Allow subclasses and clients defined when the panel is ready
                ready = ready && this.fireEvent('isReady', this.getWindow());
            }
            if (ready  || i++ > timestocheck) {
                this.frameLoaded = ready;
                    this.fireEvent(ready ? 'frameload' : 'framefailed',
                               this.getWindow());
            } else {
                Ext.defer(do_check, this.pollInterval, this);
            }
        }, this)();
    },
    getDocument: function() {
        return this.getDoc();
    },
    getWindow: function() {
        return this.getWin();
    },
    setSrc: function(url) {
        this.frameLoaded = false;
        if (url == 'about:blank' || url == '') {
            this.load('about:blank');
        } else {
            this.load(Ext.urlAppend(url,
                    '_dc=' + new Date().getTime()));
        }
        this.waitForLoad();
    }
});




/**
 * Panel used for displaying old zenoss ui pages in an iframe. Set Context
 * should be called by page to initialze panel for viewing.
 *
 * @class Zenoss.BackCompatPanel
 * @extends Zenoss.ContextualIFrame
 */
Ext.define("Zenoss.BackCompatPanel", {
    alias:['widget.backcompat'],
    extend:"Zenoss.IFramePanel",
    contextUid: null,
    constructor: function(config) {
        Ext.apply(config || {}, {
            testEarlyReadiness: true
        });
        Zenoss.BackCompatPanel.superclass.constructor.call(this, config);
        this.addEvents('frameloadfinished');
        this.on('frameload', function(win) {
            if (Ext.isDefined(win.Ext) && Ext.isDefined(win.Ext.onReady)) {
                var me = this;
                win.Ext.onReady(function(){
                    me.fireEvent('frameloadfinished', win);
                });
            }else if (win.document && win.document.body) {
                this.fireEvent('frameloadfinished', win);
            } else {
                win.onload = Ext.bind(function() {
                    this.fireEvent('frameloadfinished', win);
                }, this);
            }
        }, this);

        // the frame is not finished loading until Ext is ready
        this.on('isReady', function(win){
            return Ext.isDefined(win.Ext) && Ext.isDefined(win.Ext.onReady);
        });
    },
    setContext: function(uid) {
        this.contextUid = uid;
        var url = uid;
        if (Ext.isDefined(this.viewName) && this.viewName !== null) {
            url = uid + '/' + this.viewName;
        }
        // make sure we are rendered before we set our source
        if (this.rendered) {
            this.setSrc(url);
        } else {
            this.on('afterrender', function() { this.setSrc(url);}, this, {single:true});
        }
    }
});





Zenoss.util.registerBackCompatMenu = function(menu, btn, align, offsets){

    align = align || 'bl';
    offsets = offsets || [0, 0];

    var layer = new Ext.Panel({
        floating: true,
        contentEl: menu,
        border: false,
        shadow: !Ext.isIE,
        bodyCls: menu.id=='contextmenu_items' ? 'z-bc-z-menu z-bc-page-menu' : 'z-bc-z-menu'
    });

    layer.render(Ext.getBody());

    function showMenu() {
        var xy = layer.getEl().getAlignToXY(btn.getEl(), align, offsets);
        layer.setPagePosition(xy[0], xy[1]);
        menu.dom.style.display = 'block';
        layer.show();
    }

    function hideMenu() {
        layer.hide();
    }

    function menuClicked(e) {
        var link = e.getTarget('a');
        if (link) {
            // Fake a click
            location.href = link.href;
        }
    }
    btn.on('click', function(){
        btn.fireEvent('menushow', btn, btn.menu);
    });
    btn.on('menushow', showMenu);
    btn.on('menuhide', hideMenu);
    menu.on('mousedown', menuClicked);

};

})();
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


(function(){

/**********************************************************************
 *
 * Command Panel
 *
 */
var formTpl = new Ext.Template(
    '<form name="commandform" method="POST" action="{target}">',
    '<textarea style="visibility:hidden" name="data">',
    '{data}',
    '</textarea>',
    '</form>');
formTpl.compile();

Ext.define("Zenoss.CommandPanel", {
    alias:['widget.commandpanel'],
    extend:"Zenoss.IFramePanel",
    constructor: function(config) {
        config = Ext.applyIf(config || {}, {
            ignoreClassName: true
        });
        Zenoss.CommandPanel.superclass.constructor.call(this, config);
        this.on('frameload', this.injectForm, this, {single:true});
    },
    injectForm: function(win){
        var doc = this.getDocument(),
            form = formTpl.apply({
                data: Ext.encode(this.data),
                target: this.target
            });
        this.getBody().innerHTML = form;
        this.getFrame().setAttribute("allowtransparency", "true");   
        doc.commandform.submit();
        this.parentWindow.setSize(this.parentWindow.getSize());
    }
});



/**********************************************************************
 *
 *  Command Window
 *
 */
Ext.define("Zenoss.CommandWindow", {
    alias:['widget.commandwindow'],
    extend:"Ext.Window",
    constructor: function(config) {
        this.cpanel = Ext.id();
        this.commandData = config.data ||
            { uids: config.uids, command: config.command };
        this.target = config.target;
        config = Ext.applyIf(config || {}, {
            layout: 'fit',
            title: config.command || config.title,
            cls: 'streaming-window',
            constrain: true,
            closable:true,
            plain: true,
            items: {
                id: this.cpanel,
                xtype: config.panel || 'commandpanel', //default to commandpanel
                data: this.commandData,
                target: config.target,
                autoLoad: config.autoLoad,
                parentWindow: this
            },
            fbar: {
                buttonAlign: 'left',
                id:'window_footer_toolbar',
                items: {
                    xtype: 'checkbox',
                    checked: true,
                    boxLabel: '<span style="color:white">Autoscroll</span>',
                    handler: Ext.bind(function(c){
                        if (c.checked) {
                            this.startScrolling();
                        } else {
                            this.stopScrolling();
                        }
                    }, this)
                }
            }
        });
        Zenoss.CommandWindow.superclass.constructor.call(this, config);
        this.task = new Ext.util.DelayedTask(this.scrollToBottom, this);
        this.on('afterrender', this.startScrolling, this);
        this.on('afterrender', this.resizeOnRender, this);
        this.on('afterlayout', function(){this.center();}, this, {single:true});
        this.on('close', this.stopScrolling, this);
            this.on('close', function() {
                if(Ext.isDefined(config.redirectTarget)){
                        this.closeAndRedirect();
                }
            });
    },
    resizeOnRender: function() {
        var vsize = Ext.getBody().getViewSize();
        this.setSize({width:vsize.width*0.95, height:vsize.height*0.95});
    },
    getCommandPanel: function() {
        if (Ext.isString(this.cpanel)) {
            this.cpanel = Ext.getCmp(this.cpanel);
        }
        return this.cpanel;
    },
    startScrolling: function() {
        this.task.delay(250);
    },
    stopScrolling: function() {
        this.task.cancel();
    },
    scrollToBottom: function() {
        try {
            var win = this.getCommandPanel().getWindow(),
                body = this.getCommandPanel().getBody();
            Zenoss.env.BODY = body;
            win.scrollBy(0, body.scrollHeight);
        } catch(e) {
            Ext.emptyFn();
        }

        if (Ext.get('window_footer_toolbar')) {
            Ext.get('window_footer_toolbar').focus();
            this.task.delay(250);
        }
    },
    closeAndRedirect: function() {
        window.top.location = this.redirectTarget;
        this.destroy();
    }
});



})();
(function(){
    var REMOTE = Zenoss.remote.DeviceRouter;

    var resetCombo = function(combo, manufacturer) {
        combo.clearValue();
        combo.store.setBaseParam('manufacturer', manufacturer);
        delete combo.lastQuery;
        //combo.doQuery(combo.allQuery, true);
    };

    var clickToEditConfig = function(obj, superclass) {
        return {
            constructor: function(config) {
                var title = _t('Click to edit this field');
                var editLink = '<a href="javascript:" title="' + title  + '" class="manu-edit-link">'+
                                _t('Edit') + '</a>',
                    hasPermission = true;
                // do not render the edit link if we don't have permission
                if (config.permission && !Zenoss.Security.hasPermission(config.permission)) {
                    hasPermission = false;
                    editLink = '';
                }
                config.fieldLabel += editLink;
                config.listeners = Ext.apply(config.listeners||{}, {
                    render: function(p) {
                        if (hasPermission) {
                            p.editlink = p.labelEl.select('a.manu-edit-link');
                            p.editlink.on('click', function(){
                                p.fireEvent('labelclick', p);
                            }, p);
                        }
                    }
                });
                obj.superclass.constructor.call(this, config);
                this.addEvents('labelclick');
            }
        };
    };

    Zenoss.ClickToEditField = Ext.extend(Zenoss.form.LinkField, {});


    Zenoss.ClickToEditField = Ext.extend(Zenoss.form.LinkField,
                                  clickToEditConfig(Zenoss.ClickToEditField));
    Ext.reg('clicktoedit', "Zenoss.ClickToEditField");

    Zenoss.ClickToEditNoLink = Ext.extend(Ext.form.DisplayField, {});
    Zenoss.ClickToEditNoLink = Ext.extend(Ext.form.DisplayField,
                                   clickToEditConfig(Zenoss.ClickToEditNoLink));
    Ext.reg('clicktoeditnolink', "Zenoss.ClickToEditNoLink");


    function editManuInfo (vals, uid) {
        function name(uid) {
            if (!uid){
                return 'Unknown';
            }
            if (!Ext.isString(uid)) {
                uid = uid.uid;
            }
            return uid.split('/').reverse()[0];
        }

        var FIELDWIDTH = 300;

        var hwManufacturers = {
            xtype: 'manufacturercombo',
            width: FIELDWIDTH,
            name: 'hwManufacturer',
            id: 'hwmanufacturercombo',
            fieldLabel: _t('HW Manufacturer'),
            listConfig: {
                resizable: true, resizeHandles: 'e'
            },
            listeners: {'select': function(combo, record, index){
                record = record[0];
                var productCombo = Ext.getCmp('hwproductcombo');
                resetCombo(productCombo, record.data.name);
            }}
        };

        var hwProduct = {
            xtype: 'productcombo',
            prodType: 'HW',
            width: FIELDWIDTH,
            listConfig: {
                resizable: true, resizeHandles: 'e'
            },
            name: 'hwProductName',
            fieldLabel: _t('HW Product'),
            id: 'hwproductcombo',
            manufacturer: name(vals.hwManufacturer)
        };

        var osManufacturers = {
            xtype: 'manufacturercombo',
            width: FIELDWIDTH,
            name: 'osManufacturer',
            id: 'osmanufacturercombo',
            fieldLabel: _t('OS Manufacturer'),
            listConfig: {
                resizable: true, resizeHandles: 'e'
            },
            listeners: {'select': function(combo, record, index){
                record = record[0];
                var productCombo = Ext.getCmp('osproductcombo');
                resetCombo(productCombo, record.data.name);
            }}
        };

        var osProduct = {
            xtype: 'productcombo',
            prodType: 'OS',
            width: FIELDWIDTH,
            listConfig: {
                resizable: true, resizeHandles: 'e'
            },
            name: 'osProductName',
            id: 'osproductcombo',
            fieldLabel: _t('OS Product'),
            manufacturer: name(vals.osManufacturer)
        };

        var win = new Zenoss.FormDialog({
            autoHeight: true,
            width: 390,
            title: _t('Edit Manufacturer Info'),
            items: [{
                xtype: 'container',
                layout: 'anchor',
                autoHeight: true,
                style: 'padding-bottom:5px;margin-bottom:5px;border-bottom:1px solid #555;',
                items: [hwManufacturers, hwProduct]
            },{
                xtype: 'container',
                layout: 'anchor',
                autoHeight: true,
                items: [osManufacturers, osProduct]
            }],
            buttons: [{
                text: _t('Save'),
                ref: '../savebtn',
                xtype: 'DialogButton',
                id: 'win-save-button',
                disabled: Zenoss.Security.doesNotHavePermission('Manage Device'),
                handler: function(btn){
                    var form = btn.refOwner.editForm.getForm(),
                        vals = form.getValues();
                    Ext.apply(vals, {uid:uid});
                    REMOTE.setProductInfo(vals, function(r) {
                        Ext.getCmp('device_overview').load();
                        win.destroy();
                    });
                }
            },{
                text: _t('Cancel'),
                xtype: 'DialogButton',
                id: 'win-cancel-button',
                handler: function(btn){
                    win.destroy();
                }
            }]
        });
        win.show();
        win.doLayout();
        Ext.getCmp('hwmanufacturercombo').getStore().addListener('load', function fn(){
            var manufacturerName = name(vals.hwManufacturer);
            Ext.getCmp('hwmanufacturercombo').setValue(manufacturerName);
        });
        Ext.getCmp('hwproductcombo').getStore().addListener('load', function fn(){
            var modelName = name(vals.hwModel);
            Ext.getCmp('hwproductcombo').setValue(modelName);
        });
        Ext.getCmp('osmanufacturercombo').getStore().addListener('load', function fn(){
            var manufacturerName = name(vals.osManufacturer);
            Ext.getCmp('osmanufacturercombo').setValue(manufacturerName);
        });
        Ext.getCmp('osproductcombo').getStore().addListener('load', function fn(){
            var modelName = name(vals.osModel);
            Ext.getCmp('osproductcombo').setValue(modelName);
        });
    }


    var editCollector = function(values, uid) {
        var win = new Zenoss.FormDialog({
            autoHeight: true,
            width: 300,

            title: _t('Set Collector'),
            items: [{
                xtype: 'combo',
                name: 'collector',
                listConfig: {
                    resizable: true, resizeHandles: 'e'
                },
                fieldLabel: _t('Select a collector'),
                queryMode: 'local',
                store: new Ext.data.ArrayStore({
                    data: Zenoss.env.COLLECTORS,
                    fields: ['name']
                }),
                valueField: 'name',
                displayField: 'name',
                value: values.collector,
                forceSelection: true,
                editable: false,
                autoSelect: true,
                triggerAction: 'all'
            },{
                xtype: 'checkbox',
                name: 'moveData',
                fieldLabel: _t('Move Data')
            }],
            buttons: [{
                text: _t('Save'),
                ref: '../savebtn',
                xtype: 'DialogButton',
                id: 'editcollector-save-button',
                disabled: Zenoss.Security.doesNotHavePermission('Manage Device'),
                handler: function(btn) {
                    var vals = btn.refOwner.editForm.getForm().getValues();
                    var submitVals = {
                        uids: [uid],
                        asynchronous: Zenoss.settings.deviceMoveIsAsync([uid]),
                        collector: vals.collector,
                        hashcheck: '',
                        moveData: vals.moveData
                    };
                    Zenoss.remote.DeviceRouter.setCollector(submitVals, function(data) {
                        Ext.getCmp('device_overview').load();
                    });
                    win.destroy();
                }
            }, {
                text: _t('Cancel'),
                xtype: 'DialogButton',
                id: 'editcollector-cancel-button',
                handler: function(btn) {
                    win.destroy();
                }
            }]
        });
        win.show();
        win.doLayout();
    };

    var editGroups = function(currentGroups, uid, config) {
        var win = new Zenoss.FormDialog({
            width: 500,
            height: 150,
            title: config.title,
            items: [{
                xtype: 'panel',
                html: config.instructions
            }, {
                xtype: 'tbspacer',
                height: 5
            }, {
                xtype: 'panel',
                layout: 'hbox',
                width: '100%',
                items: [{
                    xtype: 'combo',
                    ref: '../../selectgroup',
                    name: 'group',
                    width: 250,
                    store: new Ext.data.DirectStore({
                        directFn: config.getGroupFn,
                        root: config.getGroupRoot,
                        fields: ['name']
                    }),
                    valueField: 'name',
                    displayField: 'name',
                    id: 'editgroups-combo',
                    forceSelection: true,
                    listConfig: {
                        resizable: true, resizeHandles: 'e'
                    },
                    editable: false,
                    autoSelect: true,
                    triggerAction: 'all',
                    flex: 4
                }, {
                    xtype: 'button',
                    ref: '../../addgroupbutton',
                    ui: 'dialog-dark',
                    text: _t('Add'),
                    id: 'addgroup-button',
                    handler: function(btn) {
                        var selectedGroup = btn.refOwner.selectgroup.getValue();
                        if (selectedGroup) {
                            btn.refOwner.grouplist.addGroup(selectedGroup);
                        }
                    },
                    flex: 1
                }]
            }, {
                xtype: 'panel',
                ref: '../grouplist',
                addGroup: function(group, displayOnly) {
                    if (group in this.groups) {
                        if (this.groups[group] == 'del')
                            this.groups[group] = '';
                        else
                            return;
                    }
                    else {
                        this.groups[group] = displayOnly ? '' : 'add';
                    }

                    var grouplist = this;
                    var oldHeight = this.getHeight();
                    this.add({xtype: 'tbspacer', height: 5});
                    this.add({
                        xtype: 'panel',
                        layout: 'hbox',
                        width: '100%',
                        layoutConfig: {
                            align:'middle'
                        },
                        items: [{
                            xtype: 'panel',
                            html: group
                        }, {
                            xtype: 'tbspacer',
                            flex: 1
                        }, {
                            xtype: 'button',
                            ui: 'dialog-dark',
                            text: _t('Remove'),
                            ref: 'delbutton',
                            group: group,
                            handler: function(btn) {
                                grouplist.delGroup(group, btn.refOwner);
                            }
                        }]
                    });
                    this.bubble(function() {this.doLayout();});

                    if (displayOnly) return;
                    win.setHeight(win.getHeight() + this.getHeight() - oldHeight);
                },
                delGroup: function(group, panel) {
                    if (this.groups[group] == 'add')
                        delete this.groups[group];
                    else
                        this.groups[group] = 'del';

                    var oldHeight = this.getHeight();
                    panel.destroy();
                    this.bubble(function() {this.doLayout();});
                    win.setHeight(win.getHeight() + this.getHeight() - oldHeight);
                },
                groups: {},
                listeners: {
                    render: function(thisPanel) {
                        Ext.each(currentGroups, function(group){
                            thisPanel.addGroup(group.uid.slice(config.dmdPrefix.length), true);
                        });
                    }
                }
            }],
            buttons: [{
                text: _t('Save'),
                ref: '../savebtn',
                xtype: 'DialogButton',
                id: 'editgroups-save-button',
                disabled: Zenoss.Security.doesNotHavePermission('Manage Device'),
                handler: function(btn) {
                    Ext.iterate(btn.refOwner.grouplist.groups, function(group, op) {
                        var submitVals = {
                            uids: [uid],
                            hashcheck: ''
                        };

                        if (op == 'del') {
                            submitVals['uid'] = config.dmdPrefix + group;
                            Zenoss.remote.DeviceRouter.removeDevices(submitVals, function(data) {
                                Ext.getCmp('device_overview').load();
                            });
                        }
                        if (op == 'add') {
                            submitVals['target'] = config.dmdPrefix + group;
                            submitVals['asynchronous'] = Zenoss.settings.deviceMoveIsAsync(submitVals.uids);
                            Zenoss.remote.DeviceRouter.moveDevices(submitVals, function(data) {
                                Ext.getCmp('device_overview').load();
                            });
                        }
                    });
                    win.destroy();
                }
            }, {
                text: _t('Cancel'),
                xtype: 'DialogButton',
                id: 'editgroups-cancel-button',
                handler: function(btn) {
                    win.destroy();
                }
            }]
        });
        win.show();
        win.doLayout();
        win.setHeight(win.getHeight() + win.grouplist.getHeight());
    };

    var editLocation = function(values, uid) {
        var win = new Zenoss.FormDialog({
            autoHeight: true,
            width: 500,
            title: _t('Set Location'),
            items: [{
                xtype: 'combo',
                name: 'location',
                fieldLabel: _t('Select a location'),
                store: new Ext.data.DirectStore({
                    autoload: true,
                    directFn: Zenoss.remote.DeviceRouter.getLocations,
                    root: 'locations',
                    fields: ['name']
                }),
                valueField: 'name',
                displayField: 'name',
                id: 'editlocation-name-combo',
                value: values.location ? values.location.uid.slice(20) : '',
                listConfig: {
                    resizable: true, resizeHandles: 'e'
                },
                width: 250,
                triggerAction: 'all'
            }],
            buttons: [{
                text: _t('Save'),
                ref: '../savebtn',
                xtype: 'DialogButton',
                id: 'editlocation-save-button',
                disabled: Zenoss.Security.doesNotHavePermission('Manage Device'),
                handler: function(btn) {
                    var vals = btn.refOwner.editForm.getForm().getValues();
                    if (vals.location) {
                        var submitVals = {
                            uids: [uid],
                            asynchronous: Zenoss.settings.deviceMoveIsAsync([uid]),
                            target: '/zport/dmd/Locations' + vals.location,
                            hashcheck: ''
                        };
                        Zenoss.remote.DeviceRouter.moveDevices(submitVals, function(data) {
                            if (data.success) {
                                Ext.getCmp('device_overview').load();
                            }
                        });
                    }
                    win.destroy();
                }
            }, {
                text: _t('Cancel'),
                xtype: 'DialogButton',
                id: 'editlocation-cancel-button',
                handler: function(btn) {
                    win.destroy();
                }
            }]
        });
        win.show();
        win.doLayout();
    };


    function isField(c) {
        return !!c.setValue && !!c.getValue && !!c.markInvalid && !!c.clearInvalid;
    }

    Ext.define("Zenoss.DeviceOverviewForm", {
        alias:['widget.devformpanel'],
        extend:"Ext.form.FormPanel",
        fieldDefaults: {
            labelAlign: 'top'
        },
        paramsAsHash: true,
        frame: false,
        defaults: {
            anchor: '95%',
            labelStyle: 'font-size: 13px; color: #5a5a5a'
        },
        buttonAlign: 'left',
        buttons: [{
            text: _t('Save'),
            xtype:'button',
            ref: '../savebtn',
            disabled: true,
            hidden: true,
            handler: function(btn){
                this.refOwner.getForm().submit();
            }
        },{
            text: _t('Cancel'),
            xtype: 'button',
            ref: '../cancelbtn',
            disabled: true,
            hidden: true,
            handler: function() {
                this.refOwner.getForm().reset();
            }
        }],
        cls: 'device-overview-form-wrapper',
        bodyCls: 'device-overview-form',
        style:{'background-color':'#fafafa'},
        listeners: {
            add: function(me, field, index){
                if (isField(field)) {
                    this.onFieldAdd.call(this, field);
                }
            },
            validitychange: function(me, isValid, eOpts) {
                this.setButtonsDisabled(!isValid);
            }
        },
        constructor: function(config) {
            config = Ext.applyIf(config || {}, {
                trackResetOnLoad: true
            });
            config.listeners = Ext.applyIf(config.listeners||{}, this.listeners);
            Zenoss.DeviceOverviewForm.superclass.constructor.call(this, config);
        },
        showButtons: function() {
            if (!this.rendered) {
                this.on('render', this.showButtons, this);
            } else {
                Ext.getCmp(this.savebtn.id).addCls("savebtn-button"+this.id);
                Ext.getCmp(this.cancelbtn.id).addCls("cancelbtn-button"+this.id);
                this.savebtn.show();
                this.cancelbtn.show();
            }
        },
        doButtons: function() {
            this.setButtonsDisabled(!this.form.isDirty());
        },
        setButtonsDisabled: function(b) {
            if (Zenoss.Security.hasPermission('Manage Device')) {
                this.savebtn.setDisabled(b);
            }
            this.cancelbtn.setDisabled(b);
        },
        onFieldAdd: function(field) {
            if (!field.isXType('displayfield')) {
                this.showButtons();
                this.mon(field, 'dirtychange', this.doButtons, this);
            }
        },
        hideFooter: function() {
            this.footer.hide();
        },
        showFooter: function() {
            this.footer.show();
        },
        addField: function(field) {
            this.add(field);
        },
        addFieldAfter: function(field, afterFieldName) {
            var position = this._indexOfFieldName(afterFieldName) +1;
            this.insert(position, field);
        },
        _indexOfFieldName: function(name) {
            var idx = -1, items = this.getItems(), i;
            for ( i = 0; i < items.length; i++ ){
                if (items[i].name == name){
                    idx = i;
                    break;
                }
            }
        return idx;
        },
        replaceField: function(name, field) {
            this.removeField(name);
            this.addField(field);
        },
        removeField: function(name) {
            var field = this.getField(name);

            if (field) {
                this.remove(field);
            }
        },
        getField: function(name) {
            return this.getItems()[this._indexOfFieldName(name)];
        },
        getItems: function(){
            return this.items.items;
        }
    });



    Ext.define("Zenoss.DeviceOverviewPanel", {
        alias:['widget.deviceoverview'],
        extend:"Ext.Panel",
        constructor: function(config) {
            config = Ext.applyIf(config||{}, {
                autoScroll: true,
                bodyCls: 'device-overview-panel',
                padding: '10',
                frame: false,
                forms: [],
                listeners: {
                    add: function(me, container) {
                        Ext.each(container.items.items, function(item) {
                            if (item.isXType('form')) {
                                var f = item.getForm();
                                f.api = this.api;
                                f.baseParams = this.baseParams;
                                this.forms.push(item);
                            }
                        }, this);
                    }
                },
                items: [{
                    layout: {
                        type: 'hbox'
                    },
                    id: 'deviceoverviewpanel_main',
                    defaults: {
                        bodyStyle: 'background-color:#fafafa;',
                        minHeight: 350,
                        margin:'0 10 10 0',
                        flex: 1
                    },
                    defaultType: 'devformpanel',
                    items: [{
                        id:'deviceoverviewpanel_summary',
                        defaultType: 'displayfield',
                        frame:false,
                        items: [{
                            fieldLabel: _t('Device ID'),
                            id: 'device-id-label',
                            name: 'device'
                        },{
                            fieldLabel: _t('Uptime'),
                            id: 'uptime-label',
                            name: 'uptime'
                        },{
                            fieldLabel: _t('First Seen'),
                            id: 'first-seen-label',
                            name: 'firstSeen'
                        },{
                            fieldLabel: _t('Last Change'),
                            id: 'last-change-label',
                            name: 'lastChanged'
                        },{
                            fieldLabel: _t('Model Time'),
                            id: 'model-time-label',
                            name: 'lastCollected'
                        },{
                            fieldLabel: _t('Locking'),
                            id: 'locking-label',
                            name: 'locking'
                        },{
                            xtype: 'displayfield',
                            id: 'memory-displayfield',
                            name: 'memory',
                            fieldLabel: _t('Memory/Swap')
                        }]
                    },{
                        id:'deviceoverviewpanel_idsummary',
                        defaultType: 'displayfield',
                        frame:false,

                        listeners: {
                            actioncomplete: function(form, action) {
                                if (action.type=='directsubmit') {
                                    var bar = Ext.getCmp('devdetailbar');
                                    if (bar) {
                                        bar.refresh();
                                    }
                                }
                            }
                        },
                        items: [{
                            xtype: 'textfield',
                            name: 'name',
                            fieldLabel: _t('Device Title'),
                            id: 'device-name-textfield',
                            allowBlank: false
                        },{
                            xtype: 'ProductionStateCombo',
                            fieldLabel: _t('Production State'),
                            id: 'production-state-combo',
                            name: 'productionState'
                        },{
                            xtype: 'PriorityCombo',
                            fieldLabel: _t('Priority'),
                            id: 'priority-combo',
                            name: 'priority'
                        },{
                            fieldLabel: _t('Tag'),
                            name: 'tagNumber',
                            id: 'tagnumber-textfield',
                            xtype: 'textfield'
                        },{
                            fieldLabel: _t('Serial Number'),
                            name: 'serialNumber',
                            id: 'serialnumber-textfield',
                            xtype: 'textfield'
                        }]
                    },{
                        id:'deviceoverviewpanel_descriptionsummary',
                        defaultType: 'textfield',
                        frame:false,

                        items: [{
                            fieldLabel: _t('Rack Slot'),
                            name: 'rackSlot',
                            id: 'rackslot-textfield',
                            xtype: 'textfield'
                        },{
                            xtype: 'clicktoeditnolink',
                            permission: 'Manage Device',
                            listeners: {
                                labelclick: function(p){
                                    editCollector(this.getValues(), this.contextUid);
                                },
                                scope: this
                            },
                            fieldLabel: _t('Collector'),
                            name: 'collector',
                            id: 'collector-editnolink'
                        },{
                            xtype: 'clicktoedit',
                            permission: 'Manage Device',
                            listeners: {
                                labelclick: function(p){
                                    editManuInfo(this.getValues(), this.contextUid);
                                },
                                scope: this
                            },
                            name: 'hwManufacturer',
                            id: 'hwmanufacturer-editlink',
                            fieldLabel: _t('Hardware Manufacturer')
                        },{
                            xtype: 'clicktoedit',
                            permission: 'Manage Device',
                            listeners: {
                                labelclick: function(p){
                                    editManuInfo(this.getValues(), this.contextUid);
                                },
                                scope: this
                            },
                            name: 'hwModel',
                            id: 'hwmodel-editlink',
                            fieldLabel: _t('Hardware Model')
                        },{
                            xtype: 'clicktoedit',
                            permission: 'Manage Device',
                            listeners: {
                                labelclick: function(p){
                                    editManuInfo(this.getValues(), this.contextUid);
                                },
                                scope: this
                            },
                            name: 'osManufacturer',
                            id: 'osmanufacturer-editlink',
                            fieldLabel: _t('OS Manufacturer')
                        },{
                            xtype: 'clicktoedit',
                            permission: 'Manage Device',
                            listeners: {
                                labelclick: function(p){
                                    editManuInfo(this.getValues(), this.contextUid);
                                },
                                scope: this
                            },
                            name: 'osModel',
                            id: 'osmodel-editlink',
                            fieldLabel: _t('OS Model')
                        }]
                    }]
                },{
                    id:'deviceoverviewpanel_customsummary',
                    defaultType: 'devformpanel',
                    frame:false,

                    layout: 'hbox',
                    defaults: {
                        bodyStyle: 'background-color:#fafafa;',
                        minHeight: 400,
                        margin:'0 10 10 0'
                    },
                    layoutConfig: {
                        align: 'stretchmax'
                    },
                    items: [{
                        defaultType: 'displayfield',
                        flex: 2,
                        minHeight: 400,
                        frame:false,
                        id: 'deviceoverviewpanel_systemsummary',
                        items: [{
                            xtype: 'clicktoedit',
                            permission: 'Manage Device',
                            listeners: {
                                labelclick: function(p){
                                    editGroups(this.getValues().systems, this.contextUid, {
                                        title: _t('Set Systems'),
                                        instructions: _t('Add/Remove systems'),
                                        getGroupFn: Zenoss.remote.DeviceRouter.getSystems,
                                        getGroupRoot: 'systems',
                                        dmdPrefix: '/zport/dmd/Systems'
                                    });
                                },
                                scope: this
                            },
                            fieldLabel: _t('Systems'),
                            name: 'systems',
                            id: 'systems-editlink'
                        },{
                            xtype: 'clicktoedit',
                            permission: 'Manage Device',
                            listeners: {
                                labelclick: function(p){
                                    editGroups(this.getValues().groups, this.contextUid, {
                                        title: _t('Set Groups'),
                                        instructions: _t('Add/Remove groups'),
                                        getGroupFn: Zenoss.remote.DeviceRouter.getGroups,
                                        getGroupRoot: 'groups',
                                        dmdPrefix: '/zport/dmd/Groups'
                                    });
                                },
                                scope: this
                            },
                            fieldLabel: _t('Groups'),
                            name: 'groups',
                            id: 'groups-editlink'
                        },{
                            xtype: 'clicktoedit',
                            permission: 'Manage Device',
                            listeners: {
                                labelclick: function(p){
                                    editLocation(this.getValues(), this.contextUid);
                                },
                                scope: this
                            },
                            fieldLabel: _t('Location'),
                            name: 'location',
                            id: 'location-editlink'
                        },{
                            fieldLabel: _t('Links'),
                            name: 'links',
                            id: 'links-label'
                        },{
                            xtype: 'textarea',
                            grow: true,
                            fieldLabel: _t('Comments'),
                            name: 'comments',
                            id: 'comments-textarea'
                        }]
                    },{
                        id:'deviceoverviewpanel_snmpsummary',
                        defaultType: 'displayfield',
                        frame:false,

                        flex: 1,
                        bodyStyle: 'background-color:#fafafa;',
                        minHeight: 400,
                        items: [{
                            fieldLabel: _t('SNMP SysName'),
                            name: 'snmpSysName',
                            id: 'snmpsysname-label'
                        },{
                            fieldLabel: _t('SNMP Location'),
                            name: 'snmpLocation',
                            id: 'snmplocation-label'
                        },{
                            fieldLabel: _t('SNMP Contact'),
                            name: 'snmpContact',
                            id: 'snmpcontact-label'
                        },{
                            fieldLabel: _t('SNMP Description'),
                            autoWidth: true,
                            name: 'snmpDescr',
                            id: 'snmpdescr-label'
                        },{
                            fieldLabel: _t('SNMP Community'),
                            name: 'snmpCommunity',
                            id: 'snmpcommunity-label',
                            hidden: Zenoss.Security.doesNotHavePermission('Manage Device')
                        },{
                            fieldLabel: _t('SNMP Version'),
                            name: 'snmpVersion',
                            id: 'snmpversion-label'
                        }]
                    }]
                }]
            });
            Zenoss.DeviceOverviewPanel.superclass.constructor.call(this, config);
        },
        api: {
            load: Zenoss.util.isolatedRequest(REMOTE.getInfo),
            submit: function(form, success, scope) {
                var o = {},
                vals = scope.form.getValues(false, true);
                Ext.apply(o, vals, scope.form.baseParams);
                REMOTE.setInfo(o, function(result){
                    this.form.clearInvalid();
                    this.form.setValues(vals);
                    this.form.afterAction(this, true);
                    this.form.reset();
                }, scope);
            }
        },
        baseParams: {},
        setContext: function(uid) {
            this.contextUid = uid;
            this.baseParams.uid = uid;
            // if we havne't rendered yet wait until we have rendered
            if (!this.getEl()) {
                this.on('afterrender', this.load, this, {single: true});
            } else {
                this.load();
            }

        },
        getFieldNames: function() {
            var keys = [], key;
            Ext.each(this.forms, function(f){
                Ext.each(f.getForm().getFields().items, function(field) {
                    key = field.name;
                    if (Ext.Array.indexOf(keys, key)==-1 && (key != 'links') && (key != 'uptime')) {
                        keys.push(key);
                    }
                });
            });
            return keys;
        },
        load: function() {
            var o = Ext.apply({keys:this.getFieldNames()}, this.baseParams), me = this;
            var callback = function(result) {
                var D = result.data;
                if (D.locking) {
                    D.locking = Zenoss.render.locking(D.locking);
                }
                if (D.memory) {
                    D.memory = D.memory.ram + '/' + D.memory.swap;
                } else {
                    D.memory = 'Unknown/Unknown';
                }
                D.comments = Ext.htmlDecode(D.comments);
                D.tagNumber = Ext.htmlDecode(D.tagNumber);
                D.serialNumber = Ext.htmlDecode(D.serialNumber);
                D.rackSlot = Ext.htmlDecode(D.rackSlot);
                D.name = Ext.htmlDecode(D.name);
                this.setValues(D);

                // load zLinks and uptime in a separate request since they
                // can be very expensive
                var opts = Ext.apply({keys:['links', 'uptime']}, this.baseParams);
                this.api.load(opts, function(results){
                    this.setValues(results.data);
                }, this);
            };

            if (Zenoss.env.infoObject) {
                Ext.bind(callback, this, [Zenoss.env.infoObject])();
                delete Zenoss.env.infoObject;
            } else {
                this.api.load(o, callback, this);
            }

        },
        getValues: function() {
            var o = {};
            Ext.each(this.forms, function(form){
                Ext.apply(o, form.getForm().getValues(false, false, true, true));
            }, this);
            return o;
        },
        setValues: function(d) {
            this.suspendLayouts();
            Ext.each(this.forms, function(form){
                form.getForm().setValues(d);
            });
            this.resumeLayouts(true);
        }
    });

})();
(function(){

Ext.define("Zenoss.DeviceDetailItem", {
    alias:['widget.devdetailitem'],
    extend:"Ext.Container",
    constructor: function(config) {
        config = Ext.applyIf(config||{}, {
            hideParent: true,
            cls: 'devdetailitem',
            items: [{
                cls: 'devdetail-textitem ' + (config.textCls||''),
                ref: 'textitem',
                xtype: 'tbtext',
                text: config.text || ''
            },{
                cls: 'devdetail-labelitem ' + (config.labelCls||''),
                ref: 'labelitem',
                xtype: 'tbtext',
                text: config.label || ''
            }]
        });
        Zenoss.DeviceDetailItem.superclass.constructor.call(this, config);
    },
    setText: function(t) {
        this.textitem.setText(t);
    },
    setLabel: function(t) {
        this.labelitem.setText(t);
    }
});



Ext.define("Zenoss.DeviceNameItem", {
    alias:['widget.devnameitem'],
    extend:"Ext.Container",
    constructor: function(config) {
        config = Ext.applyIf(config||{}, {
            defaults: {
                xtype: 'tbtext'
            },
            items: [{
                cls: 'devdetail-devname',
                ref: 'devname'
            },{
                ref: 'devclass',
                cls: 'devdetail-devclass'
            },{
                ref: 'ipAddress',
                cls: 'devdetail-ipaddress'
            }]
        });
        Zenoss.DeviceNameItem.superclass.constructor.call(this, config);
    }
});



Ext.define("Zenoss.DeviceDetailBar", {
    alias:['widget.devdetailbar'],
    extend:"Zenoss.LargeToolbar",
    constructor: function(config) {
        config = Ext.applyIf(config || {}, {
            cls: 'largetoolbar devdetailbar',
            height: 55,
            directFn: Zenoss.remote.DeviceRouter.getInfo,
            defaultType: 'devdetailitem',
            items: [{
                ref: 'iconitem',
                cls: 'devdetail-icon'
            },{
                cls: 'evdetail-sep'
            },{
                xtype: 'devnameitem',
                height: 45,
                ref: 'deviditem'
            },'-',{
                xtype: "eventrainbow",
                width:202,
                ref: 'eventsitem',
                id: 'detailrainbow',
                label: _t('Events'),
                listeners: {
                    render: function(me) {
                        me.getEl().on('click', function(){
                            Ext.History.add('#deviceDetailNav:device_events');
                        });
                    }
                },
                count: 4
            },'-',{
                ref: 'statusitem',
                width:98,
                label: _t('Device Status'),
                id: 'statusitem'
            },'-',{
                ref: 'prodstateitem',
                width:120,
                label: _t('Production State'),
                id: 'prodstateitem'
            },'-',{
                ref: 'priorityitem',
                width:100,
                label: _t('Priority'),
                id: 'priorityitem'
            }]
        });
        this.contextKeys = [
            'ipAddressString',
            'deviceClass',
            'name',
            'icon',
            'status',
            'productionState',
            'priority'
        ];
        Zenoss.DeviceDetailBar.superclass.constructor.call(this, config);
    },
    contextCallbacks: [],
    addDeviceDetailBarItem: function(item, fn, added_keys) {
      this.add('-');
      this.add(item);
      this.on('contextchange', fn, this);
      for (var i = 0; i < added_keys.length; i++) {
        this.contextKeys.push(added_keys[i]);
      }
    },
    refresh: function() {
        this.setContext(this.contextUid);
    },
    setContext: function(uid) {
        this.contextUid = uid;
        this.directFn({uid:uid, keys:this.contextKeys}, function(result){
            this.suspendLayouts();
            this.layout.targetEl.setWidth(this.getWidth());
            var ZR = Zenoss.render,
                data = result.data;
            Zenoss.env.icon = this.iconitem;
            this.iconitem.getEl().setStyle({
                'background-image' : 'url(' + data.icon + ')'
            });
            this.deviditem.devname.setText(Ext.htmlEncode(data.name));
            var ipAddress = data.ipAddressString;
            this.deviditem.ipAddress.setText(ipAddress);
            this.deviditem.devclass.setText(ZR.DeviceClass(data.deviceClass.uid));
            this.eventsitem.setContext(uid);
            this.statusitem.setText(
                ZR.pingStatusLarge(data.status));
                
            /* reformat the production state name so that it doesn't mess up the UI when too long */
            var pstatetxt = Zenoss.env.PRODUCTION_STATES_MAP[data.productionState];
            var pstate =  "<span title='"+pstatetxt+"'>";
                pstate += pstatetxt.length > 14 ? pstatetxt.substring(0, 12)+"..." : pstatetxt;
                pstate += "</span>";
            this.prodstateitem.setText(pstate);
            this.priorityitem.setText(Zenoss.env.PRIORITIES_MAP[data.priority]);

            // reset the positions based on text width and what not:
            this.iconitem.setPosition(0, 0);
            Ext.getCmp(Ext.query('.evdetail-sep')[0].id).setPosition(this.iconitem.getWidth()+this.iconitem.x, 0);
            var devitem_y = Ext.isEmpty(ipAddress) ? 7 : -2;
            this.deviditem.setPosition(this.iconitem.getWidth() +this.iconitem.x + 30, devitem_y);
            Ext.getCmp('detailrainbow').setPosition(this.deviditem.devname.getWidth() +this.deviditem.x + 30, 3);
            this.statusitem.setPosition(Ext.getCmp('detailrainbow').getWidth() +Ext.getCmp('detailrainbow').x + 30, -2);
            Ext.getCmp(Ext.query('.x-toolbar-separator')[0].id).setPosition(this.statusitem.getWidth()+this.statusitem.x+10, 14);
            this.prodstateitem.setPosition(this.statusitem.getWidth() +this.statusitem.x + 30, -2);
            Ext.getCmp(Ext.query('.x-toolbar-separator')[1].id).setPosition(this.prodstateitem.getWidth()+this.prodstateitem.x+10, 14);
            this.priorityitem.setPosition(this.prodstateitem.getWidth() +this.prodstateitem.x + 30, -2);

            this.fireEvent('contextchange', this, data);
            this.resumeLayouts();
        }, this);
    }
});



})();
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


(function(){

Ext.ns('Zenoss');

Ext.define("Zenoss.ConsoleBar", {
    alias:['widget.consolebar'],
    extend:"Zenoss.LargeToolbar",
    constructor: function(config) {
        var me = this;
        var title = config.title || 'Title';
        var panel = config.parentPanel;

        delete config.title;
        config = Ext.apply(config||{}, {
            cls: 'largetoolbar consolebar',
            height: 35,
            collapseTitle: 'Instances',

            items: [{
                xtype: 'tbtext',
                text: title
            }].concat(config.leftItems||[]).concat([{
                xtype: 'tbfill'
            }])

        });

        this.callParent(arguments);

    },
    /**
     * Because in our UI we want the console bar visible when the
     * panel is collapse we add ourselves to the "dockedItems" when
     * our expand and collapse button is pressed.
     **/
    toggleDockedItemPosition: function() {
        this.up('panel').removeDocked(this, false);
        if (this.parentPanel.collapsed) {
            this.moveToSouthRegion();
        } else {
            this.moveToCenterRegion();
        }
    },
    _getRegion: function(region) {
        var reg = null;
        Ext.getCmp(this.centerPanel).items.each(function(item){
            if (item.region == region) {
                reg = item;
            }
        });
        return reg;
    },
    moveToSouthRegion: function() {
        this.dock = "top";
        this._getRegion("south").addDocked(this);
        this.parentPanel.setHeight(this.oldHeight);
        this.parentPanel.expand();
    },
    moveToCenterRegion: function() {
        this.dock = "bottom";
        this._getRegion("center").addDocked(this, 0);
        // remember the old height for when we expand
        this.oldHeight = Math.max(this.parentPanel.getEl().getComputedHeight(), this.parentPanel.initialConfig.height);
        this.parentPanel.collapse();
        // set height to 0 so the header bar disappears
        this.parentPanel.setHeight(0);
    }

});

})(); // End local namespace
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


(function(){

Ext.ns('Zenoss');



/**
 * @class Zenoss.AddToZenPackWindow
 * @extends Zenoss.dialog.BaseWindow
 */
Ext.define("Zenoss.AddToZenPackWindow", {
    alias:['widget.AddToZenPackWindow'],
    extend:"Zenoss.dialog.BaseWindow",
    constructor: function(config) {
        var me = this;
        config = Ext.applyIf(config || {}, {
            title: _t('Add to Zen Pack'),
            layout: 'fit',
            modal: true,
            autoHeight: true,
            width: 310,
            plain: true,
            items: [{
                id: 'addzenpackform',
                xtype: 'form',
                listeners: {
                    validitychange: function(form, isValid) {
                        me.query('DialogButton')[0].setDisabled(!isValid);
                    }
                },
                defaults: {width: 250},
                autoHeight: true,
                frame: false,
                fieldDefaults: {
                    labelWidth: 100,
                    labelAlign: 'top'
                },
                buttonAlign: 'left',
                items: [{
                    fieldLabel: _t('Zen Pack'),
                    name: 'zpname',
                    xtype: 'combo',
                    emptyText: _t('Please select a zenpack...'),
                    listEmptyText: _t('No zenpacks available'),
                    allowBlank: false,
                    listConfig:{
                        resizable: true
                    },
                    store: new Zenoss.NonPaginatedStore({
                        id: 'myzpstore',
                        root: 'packs',
                        model: 'Zenoss.model.Name',
                        totalProperty: 'totalCount',
                        directFn: Zenoss.remote.ZenPackRouter.getEligiblePacks
                    }),
                    valueField: 'name',
                    displayField: 'name',
                    forceSelection: true,
                    triggerAction: 'all',
                    selectOnFocus: true,
                    id: 'zpcombobox'
                }],
                buttons: [{
                    text: _t('Submit'),
                    xtype: 'DialogButton',
                    disabled: true,
                    handler: function () {
                        var form;
                        form = Ext.getCmp('addzenpackform');
                        var chosenzenpack =
                            form.getForm().findField('zpname').getValue();
                            Zenoss.remote.ZenPackRouter.addToZenPack({
                                topack: me.target,
                                zenpack: chosenzenpack
                            },
                            function (data) {
                                Zenoss.message.info(_t("The item was added to the zenpack, {0}"), chosenzenpack);
                            }
                        );
                    }
                },{
                    text: _t('Cancel'),
                    xtype: 'DialogButton'
                }]
            }]
        });
        Zenoss.AddToZenPackWindow.superclass.constructor.call(this, config);
    },
    setTarget: function (target) {
        this.target = target;
    }
});



})();
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


(function(){

Ext.ns('Zenoss');

Zenoss.VerticalBrowsePanel = Ext.extend(Ext.Panel, {
    constructor: function(config) {
        config = Ext.applyIf(config||{}, {
            layout: 'hbox',
            border: false,
            layoutConfig: {
                align: 'stretch'
            },
            defaults: {
                flex: 1,
                autoScroll: true
            }
        });
        Zenoss.VerticalBrowsePanel.superclass.constructor.call(this, config);
    }
});

})();
/*****************************************************************************
 *
 * Copyright (C) Zenoss, Inc. 2010-2013, all rights reserved.
 *
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 *
 ****************************************************************************/


(function(){

var ZC = Ext.ns('Zenoss.component'),
    NM = ZC.nameMap = {};

ZC.registerName = function(meta_type, name, plural) {
    NM[meta_type] = [name, plural];
};

ZC.displayName = function(meta_type) {
    return NM[meta_type] || [meta_type, meta_type];
};

ZC.displayNames = function() {
    return NM;
};

function render_link(ob) {
    if (ob && ob.uid) {
        return Zenoss.render.link(ob.uid);
    } else {
        return ob;
    }
}
function getComponentEventPanelColumnDefinitions() {
    var fields = ['eventState',
                  'severity',
                  'eventClass',
                  'summary',
                  'firstTime',
                  'lastTime',
                  'count'],
        cols;
    cols = Zenoss.util.filter(Zenoss.env.COLUMN_DEFINITIONS, function(col){
        return Ext.Array.indexOf(fields, col.dataIndex) != -1;
    });

    // delete the ids to make sure we do not have duplicates,
    // they are not needed
    Ext.Array.each(cols, function(col){
        if (col.id) {
            delete col.id;
        }
    });

    return cols;
}

Zenoss.nav.register({
    Component: [{
        nodeType: 'subselect',
        id: 'Graphs',
        text: _t('Graphs'),
        action: function(node, target, combo) {
            var uid = combo.contextUid,
                cardid = 'graph_panel',
                graphs = {
                    id: cardid,
                    xtype: 'graphpanel',
                    viewName: 'graphs',
                    showToolbar: false,
                    text: _t('Graphs')
                };
            if (!Ext.get('graph_panel')) {
                target.add(graphs);
            }

            target.layout.setActiveItem(cardid);
            target.layout.activeItem.setContext(uid);
            var tbar = target.getDockedItems()[0];
            if (tbar._btns) {
                Ext.each(tbar._btns, tbar.remove, tbar);
            }
            var btns = tbar.add([
                '->',
                 {
                    xtype: 'drangeselector',
                    listeners: {
                        select: function(combo, records, index){
                            var value = records[0].data.id,
                                panel = Ext.getCmp(cardid);
                            panel.setDrange(value);
                        }
                    }
                },'-', {
                    xtype: 'button',
                    ref: '../resetBtn',
                    text: _t('Reset'),
                    handler: function(btn) {
                        Ext.getCmp(cardid).setDrange();
                    }
                },'-',{
                    xtype: 'tbtext',
                    text: _t('Link Graphs?')
                },{
                    xtype: 'checkbox',
                    ref: '../linkGraphs',
                    checked: true,
                    listeners: {
                        change: function(chkBx, checked) {
                            var panel = Ext.getCmp(cardid);
                            panel.setLinked(checked);
                        }
                    }
                }, '-', {
                    xtype: 'graphrefreshbutton',
                    stateId: 'ComponentGraphRefresh',
                    iconCls: 'refresh',
                    text: _t('Refresh'),
                    handler: function(btn) {
                        if (cardid && Ext.getCmp(cardid)) {
                            Ext.getCmp(cardid).resetSwoopies();
                        }
                    }
                }
            ]);
            tbar.doLayout();
            tbar._btns = btns;
            combo.on('select', function(c, selected){
                if (c.value!="Graphs") {
                    Ext.each(btns, tbar.remove, tbar);
                }
            }, this, {single:true});
        }
    },{
        nodeType: 'subselect',
        id: 'Events',
        text: _t('Events'),
        action: function(node, target, combo) {
            var uid = combo.contextUid,
                cardid = 'event_panel',
                showPanel = function() {
                    target.layout.setActiveItem(cardid);
                    target.layout.activeItem.setContext(uid);
                };
            if (!Ext.get('event_panel')) {
                var panel = target.add({
                    id: cardid,
                    xtype: 'SimpleEventGridPanel',
                    displayFilters: false,
                    stateId: 'component-event-console',
                    columns: getComponentEventPanelColumnDefinitions()
                });
            }
            var tbar = target.getDockedItems()[0];
            if (tbar._btns) {
                Ext.each(tbar._btns, tbar.remove, tbar);
            }

            var btns = tbar.add([
                '-',
                new Zenoss.ActionButton({
                    iconCls: 'acknowledge',
                    tooltip: _t('Acknowledge events'),
                    permission: 'Manage Events',
                    handler: function() {
                        Zenoss.EventActionManager.execute(Zenoss.remote.EventsRouter.acknowledge);
                    }
                }),
                new Zenoss.ActionButton({
                    iconCls: 'close',
                    tooltip: _t('Close events'),
                    permission: 'Manage Events',
                    handler: function() {
                        Zenoss.EventActionManager.execute(Zenoss.remote.EventsRouter.close);
                    }
                }),
                new Zenoss.ActionButton({
                    iconCls: 'refresh',
                    permission: 'View',
                    tooltip: _t('Refresh events'),
                    handler: function(btn) {
                        var grid = btn.grid || this.ownerCt.ownerCt;
                        if(grid.getComponent("event_panel")) grid = grid.getComponent("event_panel");
                        grid.refresh();
                    }
                }),
                '-',
                new Zenoss.ActionButton({
                    iconCls: 'newwindow',
                    permission: 'View',
                    tooltip: _t('Go to event console'),
                    handler: function(btn) {
                        var curState = Ext.state.Manager.get('evconsole') || {},
                        filters = curState.filters || {},
                        pat = /devices\/([^\/]+)(\/.*\/([^\/]+)$)?/,
                        st, url, matches = Ext.getCmp('event_panel').uid.match(pat);
                        if (matches){
                            filters.device = matches[1];
                            // using "name" from the parent grid here as the UID doesn't contain the component as was expected
                            filters.component = Ext.getCmp('component_card').componentgrid.getView().getSelectionModel().getSelected().get("name");
                        }
                        curState.filters = filters;
                        st = encodeURIComponent(Zenoss.util.base64.encode(Ext.encode(curState)));
                        url = '/zport/dmd/Events/evconsole?state=' + st;
                        window.open(url, '_newtab', "");
                    }
                })
            ]);

            tbar.doLayout();
            tbar._btns = btns;
            combo.on('select', function(c, selected){
                if (c.value!="Events") {
                    Ext.each(btns, tbar.remove, tbar);
                }
            }, this, {single:true});
            showPanel();
        }
    },{
        nodeType: 'subselect',
        id: 'Edit',
        text: _t('Details'),
        action: function(node, target, combo) {
            var uid = combo.contextUid;
            if (!Ext.get('edit_panel')) {
                Zenoss.form.getGeneratedForm(uid, function(config){
                    target.add(Ext.apply({id:'edit_panel'}, config));
                    target.layout.setActiveItem('edit_panel');
                });
            } else {
                target.layout.setActiveItem('edit_panel');
                target.layout.activeItem.setContext(uid);
            }
        }
    },{
        nodeType: 'subselect',
        id: 'ComponentTemplate',
        text: _t('Templates'),
        action: function(node, target, combo) {
            var uid = combo.contextUid;
            if (!Ext.get('templates_panel')) {
                target.add(Ext.create('Zenoss.ComponentTemplatePanel',{
                    ref: 'componentTemplatePanel',
                    id: 'templates_panel'
                }));
            }
            target.componentTemplatePanel.setContext(uid);
            target.layout.setActiveItem('templates_panel');
        }
    }]
});

Ext.define("Zenoss.component.ComponentDetailNav", {
    alias:['widget.componentnav'],
    extend:"Zenoss.DetailNavPanel",
    constructor: function(config) {
        Ext.applyIf(config, {
            autoHeight: true,
            autoScroll: true,
            containerScroll: true,
            menuIds: []
        });
        ZC.ComponentDetailNav.superclass.constructor.call(this, config);
        this.relayEvents(this.getSelectionModel(), ['selectionchange']);
        this.on('selectionchange', this.onSelectionChange);
    },
    onGetNavConfig: function(contextId) {
        var grid = this.ownerCt.ownerCt.ownerCt.componentgrid,
            items = [],
            monitor = false;
        Zenoss.env.GRID = grid;
        Ext.each(grid.store.data.items, function(record){
            if (record.data.monitor) { monitor = true; }
        });
        Zenoss.util.each(Zenoss.nav.get('Component'), function(item){
            if (!(item.id=='Graphs' && !monitor)) {
                items.push(item);
            }
        });
        return items;
    },
    filterNav: function(navpanel, config){
        //nav items to be excluded
        var excluded = [
            'status',
            'events',
            'resetcommunity',
            'pushconfig',
            'objtemplates',
            'modeldevice',
            'historyevents'
        ];
        return (Ext.Array.indexOf(excluded, config.id)==-1);
    },
    onSelectionChange: function(sm, node) {
        var target = this.target || Ext.getCmp('component_detail_panel'),
            action = node.data.action || Ext.bind(function(node, target) {
                var id = node.get('id');
                if (!(id in target.items.map)) {
                    var config = this.panelConfigMap[id];
                    if(config) {
                        target.add(config);
                        target.doLayout();
                    }
                }
                target.items.map[id].setContext(this.contextId);
                target.layout.setActiveItem(id);
            }, this);
        action(node, target);
    }
});


/**
 *@class Zenoss.component.ComponentPanel
 *@extends Ext.Panel
 **/
Ext.define("Zenoss.component.ComponentPanel", {
    alias:['widget.componentpanel'],
    extend:"Ext.Panel",
    constructor: function(config) {
        var tbar = config.gridtbar,
            tbarid = Ext.id();
        if (tbar) {
            if (Ext.isArray(tbar)) {
                tbar = {items:tbar};
            }
            Ext.apply(tbar, {
                id: tbarid
            });
        }
        config = Ext.applyIf(config||{}, {
            tbarid: tbarid,
            layout: 'border',
            items: [{
                region: 'north',
                height: 250,
                split: true,
                ref: 'gridcontainer',
                tbar: tbar,
                layout: 'fit'
            },{
                xtype: 'contextcardpanel',
                region: 'center',
                ref: 'detailcontainer',
                split: true,
                tbar: {
                    cls: 'largetoolbar componenttbar',
                    height: 32,
                    items: [{
                        xtype: 'tbtext',
                        text: _t("Display: ")
                    },{
                        xtype: 'detailnavcombo',
                        menuIds: [],
                        onGetNavConfig: Ext.bind(function(uid) {
                            var grid = this.componentgrid,
                                items = [],
                                monitor = false;
                            Ext.each(grid.store.data.items, function(record){
                                if (record.data.uid==uid && record.data.monitor) {
                                    monitor = true;
                                }
                            });
                            Zenoss.util.each(Zenoss.nav.get('Component'), function(item){
                                items.push(item);
                            });
                            return items;
                        }, this),
                        filterNav: function(cfg) {
                            var excluded = [
                                'status',
                                'events',
                                'resetcommunity',
                                'pushconfig',
                                'objtemplates',
                                'template',
                                'modeldevice',
                                'historyevents'
                            ];
                            return (Ext.Array.indexOf(excluded, cfg.id)==-1);
                        },
                        ref: '../../componentnavcombo',
                        getTarget: Ext.bind(function() {
                            return this.detailcontainer;
                        }, this)
                    }]
                }
            }]
        });
        ZC.ComponentPanel.superclass.constructor.call(this, config);
        this.addEvents('contextchange');
    },
    getGridToolbar: function(){
        return Ext.getCmp(this.tbarid);
    },
    selectByToken: function(token) {
        if (token) {
            var grid = this.componentgrid;
            grid.selectByToken(token);
        }
    },
    setContext: function(uid, type) {
        this.contextUid = uid;
        if (type!=this.componentType) {
            this.componentType = type;

            var compType = this.componentType + 'Panel',
                xtype = Ext.ClassManager.getByAlias('widget.' + compType) ? compType : 'ComponentGridPanel';
            this.gridcontainer.removeAll();
            this.gridcontainer.add({
                xtype: xtype,
                componentType: this.componentType,
                ref: '../componentgrid',
                listeners: {
                    render: function(grid) {
                        grid.setContext(uid);
                    },
                    rangeselect: function(sm) {
                        this.detailcontainer.removeAll();
                        this.componentnavcombo.reset();
                    },
                    selectionchange: function(sm, selected) {
                        // top grid selection change
                        var row = selected[0];
                        if (row) {
                            this.detailcontainer.removeAll();
                            this.componentnavcombo.reset();
                            Zenoss.env.compUUID = row.data.uuid;
                            this.componentnavcombo.setContext(row.data.uid);
                            var delimiter = Ext.History.DELIMITER,
                                token = Ext.History.getToken().split(delimiter, 2).join(delimiter);
                            Ext.History.add(token + delimiter + row.data.uid);
                            Ext.getCmp('component_monitor_menu_item').setDisabled(!row.data.usesMonitorAttribute);
                        } else {
                            this.detailcontainer.removeAll();
                            this.componentnavcombo.reset();
                        }
                    },
                    scope: this
                }
            });
            this.gridcontainer.doLayout();
        } else {
            this.componentgrid.setContext(uid);
        }
        this.fireEvent('contextchange', this, uid, type);
    }
});

/**
 *@class Zenoss.component.ComponentGridPanel
 *@extends Zenoss.BaseGridPanel
 * Base class for all of the component grids including the custom
 * grids extended by zenpacks.
 **/
Ext.define("Zenoss.component.ComponentGridPanel", {
    alias:['widget.ComponentGridPanel'],
    extend:"Zenoss.BaseGridPanel",
    lastHash: null,
    constructor: function(config) {
        config = config || {};
        config.fields = config.fields || [
            {name: 'severity'},
            {name: 'name'},
            {name: 'monitored'},
            {name: 'locking'}
        ];
        config.fields.push({name: 'uuid'});
        config.fields.push({name: 'uid'});
        config.fields.push({name: 'meta_type'});
        config.fields.push({name: 'monitor'});

        // compat for autoExpandColumn
        var expandColumn = config.autoExpandColumn;
        if (expandColumn && config.columns) {
            Ext.each(config.columns, function(col){
                if (expandColumn == col.id) {
                    col.flex = 1;
                }
            });
        }
        // delete the id fields so there are no duplicate ids
        Ext.each(config.columns, function(col){
            delete col.id;
        });
        var modelId = Ext.id(),
            model = Ext.define(modelId, {
                extend: 'Ext.data.Model',
                idProperty: 'uuid',
                fields: config.fields
            });
        config.sortInfo = config.sortInfo || {};
        config = Ext.applyIf(config, {
            autoExpandColumn: 'name',
            bbar: {},
            store: new ZC.BaseComponentStore({
                model: modelId,
                initialSortColumn: config.sortInfo.field || 'name',
                initialSortDirection: config.sortInfo.direction || 'ASC',
                directFn:config.directFn || Zenoss.remote.DeviceRouter.getComponents
            }),
            columns: [{
                id: 'component_severity',
                dataIndex: 'severity',
                header: _t('Events'),
                renderer: Zenoss.render.severity,
                width: 50
            },{
                id: 'name',
                dataIndex: 'name',
                header: _t('Name'),
                flex: 1
            }, {
                id: 'monitored',
                dataIndex: 'monitored',
                header: _t('Monitored'),
                renderer: Zenoss.render.checkbox,
                width: 65,
                sortable: true
            }, {
                id: 'locking',
                dataIndex: 'locking',
                header: _t('Locking'),
                renderer: Zenoss.render.locking_icons,
                width: 65
            }],
            selModel: new Ext.selection.RowModel({
                mode: 'MULTI',
                getSelected: function() {
                    var rows = this.getSelection();
                    if (!rows.length) {
                        return null;
                    }
                    return rows[0];
                }
            })
        });
        ZC.ComponentGridPanel.superclass.constructor.call(this, config);
        this.relayEvents(this.getSelectionModel(), ['rangeselect']);
        this.store.proxy.on('load',
            function(proxy, o, options) {
                this.lastHash = o.result.hash || this.lastHash;
            },
            this);
        Zenoss.util.addLoadingMaskToGrid(this);
    },
    applyOptions: function(options){
        // apply options to all future parameters, not just this operation.
        var params = this.getStore().getProxy().extraParams;

        Ext.apply(params, {
            uid: this.contextUid,
            keys: Ext.Array.pluck(this.fields, 'name'),
            meta_type: this.componentType,
            name: this.componentName
        });
    },
    filter: function(name) {
        this.componentName = name;
        this.refresh();
    },
    setContext: function(uid) {
        this.contextUid = uid;
        this.getStore().on('guaranteedrange', function(){
            var token = Ext.History.getToken();
            if (token.split(Ext.History.DELIMITER).length!=3) {
                this.getSelectionModel().selectRange(0, 0);
            }
        }, this, {single:true});
        this.callParent(arguments);
    },
    selectByToken: function(uid) {
        var store = this.getStore(),
            selectionModel = this.getSelectionModel(),
            view = this.getView(),
            me = this,
            selectToken = function() {
                function gridSelect() {
                    var found = false, i=0;
                    store.each(function(r){
                        if (r.get('uid') == uid) {
                            selectionModel.select(r);
                            view.focusRow(r.index);
                            found = true;
                            store.un('guaranteedrange', gridSelect, me);
                            return false;
                        }
                        i++;
                        return true;
                    });
                    return found;
                }

                // see if it is in the current buffer
                var found = gridSelect();
                if (!found) {

                    // find the index, scroll to that position
                    // and then select the component
                    var o = {componentUid:uid};
                    Ext.apply(o, store.getProxy().extraParams);
                    Zenoss.remote.DeviceRouter.findComponentIndex(o, function(r){
                        // will return a null if not found
                        if (Ext.isNumeric(r.index)) {
                            store.on('guaranteedrange', gridSelect, me);
                            var scroller = me.verticalScroller;
                            me.getView().scrollBy({ x: 0, y: scroller.rowHeight * r.index }, true);
                        } else {
                            // We can't find the index, it might be an invalid UID so
                            // select the first item so the details section isn't blank.
                            selectionModel.select(0);
                        }
                    });
                }
        };

        if (!store.loaded) {
            store.on('guaranteedrange', selectToken, this, {single: true});
        } else {
            selectToken();
        }

    }
});



Ext.define("Zenoss.component.BaseComponentStore", {
    extend:"Zenoss.DirectStore",
    constructor: function(config) {
        Ext.applyIf(config, {
            pageSize: Zenoss.settings.componentGridBufferSize,
            directFn: config.directFn
        });
        ZC.BaseComponentStore.superclass.constructor.call(this, config);
        this.on('guaranteedrange', function(){this.loaded = true;}, this);
    }
});


Ext.define("Zenoss.component.IpInterfacePanel", {
    alias:['widget.IpInterfacePanel'],
    extend:"Zenoss.component.ComponentGridPanel",
    constructor: function(config) {
        config = Ext.applyIf(config||{}, {
            componentType: 'IpInterface',
            autoExpandColumn: 'description',
            fields: [
                {name: 'uid'},
                {name: 'severity'},
                {name: 'name'},
                {name: 'description'},
                {name: 'ipAddressObjs'},
                {name: 'network'},//, mapping:'network.uid'},
                {name: 'macaddress'},
                {name: 'usesMonitorAttribute'},
                {name: 'operStatus'},
                {name: 'adminStatus'},
                {name: 'status'},
                {name: 'monitor'},
                {name: 'monitored'},
                {name: 'locking'},
                {name: 'duplex'},
                {name: 'netmask'}
            ],
            columns: [{
                id: 'severity',
                dataIndex: 'severity',
                header: _t('Events'),
                renderer: Zenoss.render.severity,
                width: 50
            },{
                id: 'name',
                dataIndex: 'name',
                header: _t('IP Interface'),
                width: 150
            },{
                id: 'ipAddresses',
                dataIndex: 'ipAddressObjs',
                header: _t('IP Addresses'),
                renderer: function(ipaddresses) {
                    var returnString = '';
                    Ext.each(ipaddresses, function(ipaddress, index) {
                        if (index > 0) returnString += ', ';
                        if (ipaddress && Ext.isObject(ipaddress) && ipaddress.netmask) {
                            var name = ipaddress.name + '/' + ipaddress.netmask;
                            returnString += Zenoss.render.link(ipaddress.uid, undefined, name);
                        }
                        else if (Ext.isString(ipaddress)) {
                            returnString += ipaddress;
                        }
                    });
                    return returnString;
                }
            },{
                id: 'description',
                dataIndex: 'description',
                header: _t('Description')
            },{
                id: 'macaddress',
                dataIndex: 'macaddress',
                header: _t('MAC Address'),
                width: 120
            },{
                id: 'status',
                dataIndex: 'status',
                header: _t('Monitored'),
                renderer: Zenoss.render.pingStatus,
                width: 80
            },{
                id: 'operStatus',
                dataIndex: 'operStatus',
                header: _t('Operational Status'),
                width: 110
            },{
                id: 'adminStatus',
                dataIndex: 'adminStatus',
                header: _t('Admin Status'),
                width: 80
            },{
                id: 'monitored',
                dataIndex: 'monitored',
                header: _t('Monitored'),
                renderer: Zenoss.render.checkbox,
                width: 60
            },{
                id: 'locking',
                dataIndex: 'locking',
                header: _t('Locking'),
                width: 72,
                renderer: Zenoss.render.locking_icons
            }]

        });
        ZC.IpInterfacePanel.superclass.constructor.call(this, config);
    }
});


ZC.registerName('IpInterface', _t('Interface'), _t('Interfaces'));

Ext.define("Zenoss.component.WinServicePanel", {
    alias:['widget.WinServicePanel'],
    extend:"Zenoss.component.ComponentGridPanel",
    constructor: function(config) {
        config = Ext.applyIf(config||{}, {
            componentType: 'WinService',
            fields: [
                {name: 'uid'},
                {name: 'severity'},
                {name: 'status'},
                {name: 'name'},
                {name: 'locking'},
                {name: 'usesMonitorAttribute'},
                {name: 'monitor'},
                {name: 'monitored'},
                {name: 'caption'},
                {name: 'startMode'},
                {name: 'startName'},
                {name: 'serviceClassUid'}
            ],
            columns: [{
                id: 'severity',
                dataIndex: 'severity',
                header: _t('Events'),
                renderer: Zenoss.render.severity,
                width: 60
            },{
                id: 'name',
                dataIndex: 'name',
                flex: 1,
                header: _t('Service Name'),
                renderer: Zenoss.render.WinServiceClass
            },{
                id: 'caption',
                dataIndex: 'caption',
                header: _t('Caption')
            },{
                id: 'startMode',
                dataIndex: 'startMode',
                header: _t('Start Mode')
            },{
                id: 'startName',
                dataIndex: 'startName',
                header: _t('Start Name')
            },{
                id: 'status',
                dataIndex: 'status',
                header: _t('Status'),
                renderer: Zenoss.render.pingStatus,
                width: 60
            },{
                id: 'monitored',
                dataIndex: 'monitored',
                header: _t('Monitored'),
                renderer: Zenoss.render.checkbox,
                width: 60
            },{
                id: 'locking',
                dataIndex: 'locking',
                header: _t('Locking'),
                renderer: Zenoss.render.locking_icons
            }]
        });
        ZC.WinServicePanel.superclass.constructor.call(this, config);
    }
});


ZC.registerName('WinService', _t('Windows Service'), _t('Windows Services'));


Ext.define("Zenoss.component.IpRouteEntryPanel", {
    alias:['widget.IpRouteEntryPanel'],
    extend:"Zenoss.component.ComponentGridPanel",
    constructor: function(config) {
        config = Ext.applyIf(config||{}, {
            componentType: 'IpRouteEntry',
            autoExpandColumn: 'destination',
            fields: [
                {name: 'uid'},
                {name: 'destination'},
                {name: 'nextHop'},
                {name: 'id'}, // needed for nextHop link
                {name: 'device'}, // needed for nextHop link
                {name: 'interface'},
                {name: 'protocol'},
                {name: 'type'},
                {name: 'locking'},
                {name: 'usesMonitorAttribute'},
                {name: 'monitored'}
            ],
            columns: [{
                id: 'destination',
                dataIndex: 'destination',
                header: _t('Destination'),
                renderer: render_link
            },{
                id: 'nextHop',
                dataIndex: 'nextHop',
                header: _t('Next Hop'),
                renderer: Zenoss.render.nextHop,
                width: 250
            },{
                id: 'interface',
                dataIndex: 'interface',
                header: _t('Interface'),
                renderer: render_link
            },{
                id: 'protocol',
                dataIndex: 'protocol',
                header: _t('Protocol')
            },{
                id: 'type',
                dataIndex: 'type',
                header: _t('Type'),
                width: 50
            },{
                id: 'locking',
                dataIndex: 'locking',
                header: _t('Locking'),
                renderer: Zenoss.render.locking_icons
            }]
        });
        ZC.IpRouteEntryPanel.superclass.constructor.call(this, config);
    }
});


ZC.registerName('IpRouteEntry', _t('Network Route'), _t('Network Routes'));

Ext.define("Zenoss.component.IpServicePanel", {
    alias:['widget.IpServicePanel'],
    extend:"Zenoss.component.ComponentGridPanel",
    constructor: function(config) {
        config = Ext.applyIf(config||{}, {
            componentType: 'IpService',
            fields: [
                {name: 'uid'},
                {name: 'name'},
                {name: 'status'},
                {name: 'severity'},
                {name: 'usesMonitorAttribute'},
                {name: 'monitor'},
                {name: 'monitored'},
                {name: 'locking'},
                {name: 'protocol'},
                {name: 'description'},
                {name: 'ipaddresses'},
                {name: 'port'},
                {name: 'serviceClassUid'}
            ],
            columns: [{
                id: 'severity',
                dataIndex: 'severity',
                header: _t('Events'),
                renderer: Zenoss.render.severity,
                width: 60
            },{
                id: 'name',
                dataIndex: 'name',
                header: _t('Name'),
                flex: 1,
                renderer: Zenoss.render.IpServiceClass
            },{
                id: 'protocol',
                dataIndex: 'protocol',
                header: _t('Protocol')
            },{
                id: 'port',
                dataIndex: 'port',
                header: _t('Port')
            },{
                id: 'ipaddresses',
                dataIndex: 'ipaddresses',
                header: _t('IPs'),
                renderer: function(ips) {
                    return ips.join(', ');
                }
            },{
                id: 'description',
                dataIndex: 'description',
                header: _t('Description')
            },{
                id: 'monitored',
                dataIndex: 'monitored',
                header: _t('Monitored'),
                renderer: Zenoss.render.checkbox,
                width: 60
            },{
                id: 'locking',
                dataIndex: 'locking',
                header: _t('Locking'),
                renderer: Zenoss.render.locking_icons
            }]
        });
        ZC.IpServicePanel.superclass.constructor.call(this, config);
    }
});


ZC.registerName('IpService', _t('IP Service'), _t('IP Services'));


Ext.define("Zenoss.component.OSProcessPanel", {
    alias:['widget.OSProcessPanel'],
    extend:"Zenoss.component.ComponentGridPanel",
    constructor: function(config) {
        config = Ext.applyIf(config||{}, {
            componentType: 'OSProcess',
            autoExpandColumn: 'processName',
            fields: [
                {name: 'uid'},
                {name: 'processName'},
                {name: 'status'},
                {name: 'severity'},
                {name: 'usesMonitorAttribute'},
                {name: 'monitor'},
                {name: 'monitored'},
                {name: 'locking'},
                {name: 'processClass'},
                {name: 'processClassName'},
                {name: 'alertOnRestart'},
                {name: 'failSeverity'}
            ],
            columns: [{
                id: 'severity',
                dataIndex: 'severity',
                header: _t('Events'),
                renderer: Zenoss.render.severity,
                width: 60
            },{
                id: 'processClass',
                dataIndex: 'processClass',
                header: _t('Process Class'),
                renderer: function(cls, meta, record) {
                    if (cls && cls.uid) {
                        return Zenoss.render.link(cls.uid, null, record.raw.processClassName);
                    } else {
                        return cls;
                    }
                }
            },{
                id: 'processName',
                dataIndex: 'processName',
                header: _t('Process Set')
            },{
                id: 'alertOnRestart',
                dataIndex: 'alertOnRestart',
                renderer: Zenoss.render.checkbox,
                width: 85,
                header: _t('Restart Alert?')
            },{
                id: 'failSeverity',
                dataIndex: 'failSeverity',
                renderer: Zenoss.render.severity,
                width: 70,
                header: _t('Fail Severity')
            },{
                id: 'monitored',
                dataIndex: 'monitored',
                header: _t('Monitored'),
                renderer: Zenoss.render.checkbox,
                width: 60
            },{
                id: 'locking',
                dataIndex: 'locking',
                header: _t('Locking'),
                width: 55,
                renderer: Zenoss.render.locking_icons
            }]
        });
        ZC.OSProcessPanel.superclass.constructor.call(this, config);
    }
});


ZC.registerName('OSProcess', _t('OS Process'), _t('OS Processes'));


Ext.define("Zenoss.component.FileSystemPanel", {
    alias:['widget.FileSystemPanel'],
    extend:"Zenoss.component.ComponentGridPanel",
    constructor: function(config) {
        config = Ext.applyIf(config||{}, {
            autoExpandColumn: 'mount',
            componentType: 'FileSystem',
            fields: [
                {name: 'uid'},
                {name: 'name'},
                {name: 'status'},
                {name: 'severity'},
                {name: 'usesMonitorAttribute'},
                {name: 'monitor'},
                {name: 'monitored'},
                {name: 'locking'},
                {name: 'mount'},
                {name: 'totalBytes'},
                {name: 'availableBytes'},
                {name: 'usedBytes'},
                {name: 'capacityBytes'}
            ],
            columns: [{
                id: 'severity',
                dataIndex: 'severity',
                header: _t('Events'),
                renderer: Zenoss.render.severity,
                width: 60
            },{
                id: 'mount',
                dataIndex: 'mount',
                header: _t('Mount Point')
            },{
                id: 'totalBytes',
                dataIndex: 'totalBytes',
                header: _t('Total Bytes'),
                renderer: Zenoss.render.bytesString
            },{
                id: 'usedBytes',
                dataIndex: 'usedBytes',
                header: _t('Used Bytes'),
                renderer: Zenoss.render.bytesString
            },{
                id: 'availableBytes',
                dataIndex: 'availableBytes',
                header: _t('Free Bytes'),
                renderer: function(n){
                    if (n<0) {
                        return _t('Unknown');
                    } else {
                        return Zenoss.render.bytesString(n);
                    }

                }
            },{
                id: 'capacityBytes',
                dataIndex: 'capacityBytes',
                header: _t('% Util'),
                renderer: function(n) {
                    if (n=='unknown' || n<0) {
                        return _t('Unknown');
                    } else {
                        return n + '%';
                    }
                }

            },{
                id: 'monitored',
                dataIndex: 'monitored',
                header: _t('Monitored'),
                renderer: Zenoss.render.checkbox,
                width: 60
            },{
                id: 'locking',
                dataIndex: 'locking',
                header: _t('Locking'),
                renderer: Zenoss.render.locking_icons
            }]
        });
        ZC.FileSystemPanel.superclass.constructor.call(this, config);
    }
});


ZC.registerName('FileSystem', _t('File System'), _t('File Systems'));


Ext.define("Zenoss.component.CPUPanel", {
    alias:['widget.CPUPanel'],
    extend:"Zenoss.component.ComponentGridPanel",
    constructor: function(config) {
        config = Ext.applyIf(config||{}, {
            componentType: 'CPU',
            autoExpandColumn: 'product',
            fields: [
                {name: 'uid'},
                {name: 'socket'},
                {name: 'manufacturer'},
                {name: 'product'},
                {name: 'clockspeed'},
                {name: 'extspeed'},
                {name: 'cacheSizeL1'},
                {name: 'cacheSizeL2'},
                {name: 'voltage'},
                {name: 'locking'},
                {name: 'usesMonitorAttribute'},
                {name: 'monitored'}
            ],
            columns: [{
                id: 'socket',
                dataIndex: 'socket',
                header: _t('Socket'),
                width: 45
            },{
                id: 'manufacturer',
                dataIndex: 'manufacturer',
                header: _t('Manufacturer'),
                renderer: render_link
            },{
                id: 'product',
                dataIndex: 'product',
                header: _t('Model'),
                renderer: render_link
            },{
                id: 'clockspeed',
                dataIndex: 'clockspeed',
                header: _t('Speed'),
                width: 70,
                renderer: function(x){ return x + ' MHz';}
            },{
                id: 'extspeed',
                dataIndex: 'extspeed',
                header: _t('Ext Speed'),
                width: 70,
                renderer: function(x){ return x + ' MHz';}
            },{
                id: 'cacheSizeL1',
                dataIndex: 'cacheSizeL1',
                header: _t('L1'),
                width: 70,
                renderer: function(x){ return x + ' KB';}
            },{
                id: 'cacheSizeL2',
                dataIndex: 'cacheSizeL2',
                header: _t('L2'),
                width: 70,
                renderer: function(x){ return x + ' KB';}
            },{
                id: 'voltage',
                dataIndex: 'voltage',
                header: _t('Voltage'),
                width: 70,
                renderer: function(x){ return x + ' mV';}
            },{
                id: 'locking',
                dataIndex: 'locking',
                header: _t('Locking'),
                renderer: Zenoss.render.locking_icons
            }]
        });
        ZC.CPUPanel.superclass.constructor.call(this, config);
    }
});


ZC.registerName('CPU', _t('Processor'), _t('Processors'));


Ext.define("Zenoss.component.ExpansionCardPanel", {
    alias:['widget.ExpansionCardPanel'],
    extend:"Zenoss.component.ComponentGridPanel",
    constructor: function(config) {
        config = Ext.applyIf(config||{}, {
            componentType: 'ExpansionCard',
            autoExpandColumn: 'name',
            fields: [
                {name: 'uid'},
                {name: 'slot'},
                {name: 'name'},
                {name: 'serialNumber'},
                {name: 'manufacturer'},
                {name: 'product'},
                {name: 'locking'},
                {name: 'usesMonitorAttribute'},
                {name: 'monitored'}
            ],
            columns: [{
                id: 'slot',
                dataIndex: 'slot',
                header: _t('Slot'),
                width: 80
            },{
                id: 'name',
                dataIndex: 'name',
                header: _t('Name')
            },{
                id: 'serialNumber',
                dataIndex: 'serialNumber',
                header: _t('Serial Number'),
                width: 110
            },{
                id: 'manufacturer',
                dataIndex: 'manufacturer',
                header: _t('Manufacturer'),
                renderer: render_link,
                width: 110
            },{
                id: 'product',
                dataIndex: 'product',
                header: _t('Model'),
                renderer: render_link,
                width: 130
            },{
                id: 'locking',
                dataIndex: 'locking',
                header: _t('Locking'),
                renderer: Zenoss.render.locking_icons
            }]
        });
        ZC.ExpansionCardPanel.superclass.constructor.call(this, config);
    }
});


ZC.registerName('ExpansionCard', _t('Card'), _t('Cards'));


Ext.define("Zenoss.component.PowerSupplyPanel", {
    alias:['widget.PowerSupplyPanel'],
    extend:"Zenoss.component.ComponentGridPanel",
    constructor: function(config) {
        config = Ext.applyIf(config||{}, {
            componentType: 'PowerSupply',
            autoExpandColumn: 'name',
            fields: [
                {name: 'uid'},
                {name: 'severity'},
                {name: 'name'},
                {name: 'watts'},
                {name: 'type'},
                {name: 'state'},
                {name: 'millivolts'},
                {name: 'locking'},
                {name: 'usesMonitorAttribute'},
                {name: 'monitor'},
                {name: 'monitored'}
            ],
            columns: [{
                id: 'severity',
                dataIndex: 'severity',
                header: _t('Events'),
                renderer: Zenoss.render.severity,
                width: 60
            },{
                id: 'name',
                dataIndex: 'name',
                header: _t('Name')
            },{
                id: 'watts',
                dataIndex: 'watts',
                header: _t('Watts')
            },{
                id: 'type',
                dataIndex: 'type',
                header: _t('Type')
            },{
                id: 'state',
                dataIndex: 'state',
                header: _t('State')
            },{
                id: 'millivolts',
                dataIndex: 'millivolts',
                header: _t('Millivolts')
            },{
                id: 'locking',
                dataIndex: 'locking',
                header: _t('Locking'),
                renderer: Zenoss.render.locking_icons
            }]
        });
        ZC.PowerSupplyPanel.superclass.constructor.call(this, config);
    }
});


ZC.registerName('PowerSupply', _t('Power Supply'), _t('Power Supplies'));


Ext.define("Zenoss.component.TemperatureSensorPanel", {
    alias:['widget.TemperatureSensorPanel'],
    extend:"Zenoss.component.ComponentGridPanel",
    constructor: function(config) {
        config = Ext.applyIf(config||{}, {
            componentType: 'TemperatureSensor',
            autoExpandColumn: 'name',
            fields: [
                {name: 'uid'},
                {name: 'severity'},
                {name: 'name'},
                {name: 'state'},
                {name: 'temperature'},
                {name: 'locking'},
                {name: 'usesMonitorAttribute'},
                {name: 'monitor'},
                {name: 'monitored'}
            ],
            columns: [{
                id: 'severity',
                dataIndex: 'severity',
                header: _t('Events'),
                renderer: Zenoss.render.severity,
                width: 60
            },{
                id: 'name',
                dataIndex: 'name',
                header: _t('Name')
            },{
                id: 'state',
                dataIndex: 'state',
                header: _t('State')
            },{
                id: 'temperature',
                dataIndex: 'temperature',
                header: _t('Temperature'),
                renderer: function(x) {
                    if (x == null) {
                        return "";
                    } else {
                        return x + " F";
                    }
                }
            },{
                id: 'locking',
                dataIndex: 'locking',
                header: _t('Locking'),
                renderer: Zenoss.render.locking_icons
            }]
        });
        ZC.TemperatureSensorPanel.superclass.constructor.call(this, config);
    }
});


ZC.registerName('TemperatureSensor', _t('Temperature Sensor'), _t('Temperature Sensors'));


Ext.define("Zenoss.component.FanPanel", {
    alias:['widget.FanPanel'],
    extend:"Zenoss.component.ComponentGridPanel",
    constructor: function(config) {
        config = Ext.applyIf(config||{}, {
            componentType: 'Fan',
            autoExpandColumn: 'name',
            fields: [
                {name: 'uid'},
                {name: 'severity'},
                {name: 'name'},
                {name: 'state'},
                {name: 'type'},
                {name: 'rpm'},
                {name: 'locking'},
                {name: 'usesMonitorAttribute'},
                {name: 'monitor'},
                {name: 'monitored'}
            ],
            columns: [{
                id: 'severity',
                dataIndex: 'severity',
                header: _t('Events'),
                renderer: Zenoss.render.severity,
                width: 60
            },{
                id: 'name',
                dataIndex: 'name',
                header: _t('Name')
            },{
                id: 'state',
                dataIndex: 'state',
                header: _t('State')
            },{
                id: 'type',
                dataIndex: 'type',
                header: _t('Type')
            },{
                id: 'rpm',
                dataIndex: 'rpm',
                header: _t('RPM')
            },{
                id: 'locking',
                dataIndex: 'locking',
                header: _t('Locking'),
                renderer: Zenoss.render.locking_icons
            }]
        });
        ZC.FanPanel.superclass.constructor.call(this, config);
    }
});


ZC.registerName('Fan', _t('Fan'), _t('Fans'));

})();
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


/* package level */
(function() {
    var ReverseSeverity,
        Severity;
    Ext.define("Severity", {
        alias:['widget.severity'],
        extend:"Ext.form.ComboBox",
        constructor: function(config) {
            config = config || {};

            Ext.applyIf(config, {
                fieldLabel: _t('Severity'),
                name: 'severity',
                editable: false,
                forceSelection: true,
                autoSelect: true,
                triggerAction: 'all',
                queryMode: 'local',
                // this is defined in zenoss.js so should always be present
                store: Zenoss.env.SEVERITIES
            });
            this.callParent(arguments);
        }
    });


    Ext.define("ReverseSeverity", {
        alias:['widget.reverseseverity'],
        extend:"Severity",
        constructor: function(config) {
            var severities = [[0, "Critical"], [1, "Error"], [2, "Warning"], [3, "Info"], [4, "Debug"], [5, "Clear"]];
            config = config || {};
            Ext.applyIf(config, {
                store: severities
            });
            this.callParent(arguments);
        }
    });


}());
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


/* package level */
(function() {
     Ext.define("Zenoss.form.EventClass", {
         alias:['widget.eventclass'],
         extend:"Ext.form.ComboBox",
         constructor: function(config) {
             config = config || {};
             if (!Zenoss.env.EVENT_CLASSES) {
                 throw "You must include the js-snippets viewlet before you use the eventClass control";
             }
             Ext.applyIf(config, {
                 name: 'eventClass',
                 typeAhead: true,
                 editable: true,
                 forceSelection: true,
                 autoSelect: true,
                 triggerAction: 'all',
                 listConfig: {
                     maxWidth:250,
                     maxHeight: 250,
                     resizable: true
                 },
                 queryMode: 'local',
                 store: Zenoss.env.EVENT_CLASSES
             });
             this.callParent([config]);
         }
     });

}());
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


/* package level */
(function() {
Ext.define("Zenoss.form.DataPointItemSelector", {
    alias:['widget.datapointitemselector'],
    extend:"Ext.ux.form.ItemSelector",
    constructor: function(config) {
        var record = config.record;

        this.value = config.value;

        Ext.applyIf(config, {
            name: 'dataPoints',
            fieldLabel: _t('Data Points'),
            id: 'thresholdItemSelector',
            imagePath: "/++resource++zenui/img/xtheme-zenoss/icon",
            drawUpIcon: false,
            drawDownIcon: false,
            drawTopIcon: false,
            drawBotIcon: false,
            store: record.allDataPoints
        });
        this.callParent(arguments);
    },
    /**
     * In ExtJs 4.1 The ItemsSelect getValue doesn't work at all.
     *
     * To work around this we can just grab everything in the toField store.
     *
     */
    getValue: function(){
        var store = this.toField.getStore();
        return Ext.pluck(Ext.pluck(store.data.items, 'data'), 'field1');
    }
});

}());
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


(function () {
Ext.ns('Zenoss');

Ext.define("Zenoss.ContextMenu", {
    alias:['widget.ContextMenu'],
    extend:"Ext.Button",
    /**
     * onSetContext abstract function called when the context for the menu is
     * potentially changed
     */
    onSetContext: Ext.emptyFn,
    /**
     * The object id for which the context menu belongs to
     */
    contextUid: null,
    constructor: function(config) {
        config = config || {};
        Ext.applyIf(config, {
            id: 'context-configure-menu',
            iconCls: 'customize'
        });
        Zenoss.ContextMenu.superclass.constructor.call(this, config);
    },
    setContext: function(uid) {
        this.contextUid = uid;
    }
});




Ext.define("Zenoss.ContextConfigureMenu", {
    alias:['widget.ContextConfigureMenu'],
    extend:"Zenoss.ContextMenu",
    /**
     * onGetMenuItems abstract function; hook to provide
     * more menu items based on context
     * @param {string} uid; item to get menu items for
     */
    onGetMenuItems: function(uid){ return []; },
    /**
     * Called when an item in the menu is selected
     * @param {object} this, the ContextConfigureMenu
     * @param {object} the menu item selection
     */
    onSelectionChange: Ext.emptyFn,
    /**
     * Filter out menu items;  Return true if it should be kept, false otherwise
     * @param {ContextConfigureMenu}
     * @param {Object} itemConfig
     */
    filterMenu: function(contextMenu, config) {return true;},
     /**
     * Menu ids used to get dialog menus that will be used in context menu;
     * Empty or null if no items from old menu items is desired
     */
    menuIds: ['More','Manage','Edit', 'Actions','Add','TopLevel'],
    menu: {items:[]},
    disabled: true,
    /**
     * @cfg {array} menutItems
     * items that should always be included in the menu
     */
    menuItems: [],
    /**
     * set the UID, menus for the corresponding object will be determined and
     * set
     * @param {Object} uid
     */
    setContext: function(uid) {
        this.disable();
        this.onSetContext(uid);
        this.contextUid = uid;
        var menu = this.menu;
        menu.removeAll();
        this.getMenuItems(uid);
    },
    /**
     * private
     * handler for add to zenpack menu item; displays dialog
     * @param {Object} uid
     */
     addToZenPackHandler: function(e) {
        var dialog = Ext.create('Zenoss.AddToZenPackWindow', {});
        dialog.setTarget(this.contextUid);
        dialog.show();
    },
    /**
     * private
     * gets the menu items to be displayed
     * @param {Object} uid
     */
    getMenuItems: function(uid){
        var callback = function(provider, response){
            var menuItems = [], visibleMenuCount = 0;
            //get statically defined menu items
            if (this.menuItems.length !== 0) {
                menuItems = menuItems.concat(this.menuItems);
            }
            //get any context specific menus if defined
            var moreMenuItems = this.onGetMenuItems(this.contextUid);
            if (moreMenuItems !== null || moreMenuItems.length > 0){
                menuItems = menuItems.concat(moreMenuItems);
            }
            //menus from router
            var itemConfigs = response.result.menuItems;
            var filterFn = function(val) {
                return this.filterMenu(this, val);
            };
            itemConfigs = Zenoss.util.filter(itemConfigs, filterFn, this);
            if (itemConfigs){
                menuItems = menuItems.concat(itemConfigs);
            }
            //add all menus and set handlers if needed
            Ext.each(menuItems, function(item){
                //add to zenpack has a different/new handler
                if (item.id === 'addtozenpack'){
                    item.handler = Ext.bind(this.addToZenPackHandler, this);
                }
                if (!Ext.isDefined(item.handler)) {
                    item.handler = Ext.bind(this.defaultHandler, this);
                }

                // do now show as enabled if we only have hidden items (or spacers)
                if (!item.hidden && item != '-') {
                    visibleMenuCount += 1;
                }
                this.menu.add(item);
            }, this);

            // if we have stuff then enable this control
            if(this.menu.items.length !== 0 && visibleMenuCount){
                this.enable();
            }
        };
        var args = {
            'uid': uid
        };
        if (this.menuIds !== null && this.menuIds.length >= 1){
            args.menuIds = this.menuIds;
        }

        Zenoss.remote.DetailNavRouter.getContextMenus(args, callback, this);
    },

    /**
     * private
     * handler used if a menu item does not have a handler defined
     * @param {Object} button
     */
    defaultHandler: function(button) {
        var dialog = new Zenoss.dialog.DynamicDialog();
        dialog.setTitle(_t(button.text.replace(/\.\.\./g, '')));
        dialog.show();
        dialog.body.load({
            scripts: true,
            url: this.contextUid + '/' + button.viewName
        });
    }
});



})();
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


/* package level */
(function() {
     Ext.define("Zenoss.form.parser", {
         alias:['widget.parser'],
         extend:"Ext.form.ComboBox",
         constructor: function(config) {
             var record = config.record;
             config = config || {};
             Ext.applyIf(config, {
                 fieldLabel: _t('Parser'),
                 name: 'parser',
                 editable: false,
                 forceSelection: true,
                 autoSelect: true,
                 triggerAction: 'all',
                 minListWidth: 250,
                 listConfig: {
                     resizable: true
                 },
                 queryMode: 'local',
                 store: record.availableParsers
             });
             this.callParent(arguments);
         }
     });

}());
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


/* package level */
(function() {
     Ext.define("Zenoss.form.rrdtype", {
         alias:['widget.rrdtype'],
         extend:"Ext.form.ComboBox",
         constructor: function(config) {
             var record = config.record;
             config = config || {};
             var store = [];
             Ext.each(record.availableRRDTypes, function(item) {
                 store.push([item]);
             });
             Ext.apply(config, {
                 fieldLabel: _t('RRD Type'),
                 name: 'rrdtype',
                 editable: false,
                 forceSelection: true,
                 autoSelect: true,
                 triggerAction: 'all',
                 queryMode: 'local',
                 displayField: 'name',
                 valueField: 'name',
                 store:  Ext.create('Ext.data.ArrayStore', {
                     model: 'Zenoss.model.Name',
                     data: store
                 })
             });
             this.callParent(arguments);
         }
     });

}());
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


/* package level */
(function() {

Ext.ns('Zenoss.form');

Ext.define("Zenoss.form.Password", {
    alias:['widget.password'],
    extend:"Ext.form.TextField",
    constructor: function(config) {
         config.inputType = 'password';
         Zenoss.form.Password.superclass.constructor.apply(this, arguments);
     }
 });


})();
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


/* package level */
(function() {

Ext.ns('Zenoss.form');

Ext.define("Zenoss.form.UpDownField", {
    alias:['widget.updownfield'],
    extend:"Ext.form.ComboBox",
     constructor: function(config) {
         config = Ext.applyIf(config||{}, {
             editable: false,
             forceSelection: true,
             autoSelect: true,
             triggerAction: 'all',
             queryMode: 'local',
             store: [
                 [1, 'Up'],
                 [0, 'Down']
             ]
         });
         Zenoss.form.UpDownField.superclass.constructor.call(this, config);
     }
 });


})();
(function() {
     Ext.namespace('Zenoss.form.Alias');

     /**
      * When you press the "Add" button this will add a new
      * alias row to the panel.
      **/
     function addAliasRow() {
         var cmp = that,
             button = Ext.getCmp('add_alias_button'),
             row = {};

         cmp.remove(button);
         cmp.add(getRowTemplate());
         cmp.add(addAliasButton);
         cmp.doLayout();
     }

     /**
      * Variable Definitions
      **/
     var addAliasButton = {
         id: 'add_alias_button',
         xtype: 'button',
         ui: 'dialog-dark',
         text: 'Add',
         handler: addAliasRow
     },
     that;

     /**
      * Returns the panel definition for the id/formula row
      **/
     function getRowTemplate(id, formula) {
         return {
             xtype: 'container',
             bodyCls: 'alias',
             layout: 'hbox',
             items: [{
                 aliasType: 'id',
                 xtype: 'textfield',
                 width:'150',
                 value: id
             },{
                 aliasType: 'formula',
                 xtype: 'textfield',
                 width:'150',
                 style: {'margin-left':'10px;'},                 
                 value: formula
             },{
                 xtype: 'button',
                 ui: 'dialog-dark',
                 text: 'Delete',
                 width: '10',
                 style: {'margin-left':'10px;'},
                 handler: function() {
                     var container = this.findParentByType('container'),
                         cmp = that;
                     cmp.remove(container);
                     cmp.doLayout();
                 }
             }]
        };
     }

     /**
      * Alias Panel. NOTE: This control is designed to have
      * only one instance per page.
      **/
     Ext.define("Zenoss.form.Alias", {
         alias:['widget.alias'],
         extend:"Ext.Panel",
         constructor: function(config) {
             var aliases = config.record.aliases,
             items = [],
             i,
             alias;
             // use "that" as a closure so we have a reference to it
             that = this;
             items.push({
                xtype: 'panel',
                layout: 'anchor',
                html: _t('Alias:<br>ID / FORMULA')
             });
             config = config || {};
             // add a row for each alias defined
             for (i=0; i < aliases.length; i++) {
                 alias = aliases[i];
                 items.push(getRowTemplate(alias.name, alias.formula));
             }
             // always show an extra blank row
             items.push(getRowTemplate());

             // add the button
             items.push(addAliasButton);
             Ext.applyIf(config, {
                 items:items
             });

             Zenoss.form.Alias.superclass.constructor.apply(this, arguments);
         },

         /**
          * This returns a list of all of the  aliases in object form.
          * Since this is a Panel it must explicitly be called.
          * Ex:
          *    Ext.getCmp('aliasId').getValue();
          **/
         getValue: function(){
             var cmp = that,
                 textfields = cmp.query('textfield'),
                 results = [],
                 i, field;

             // initialize the return structure. We want an array of object literals
             // (will be dicts in python)
             for (i = 0; i < textfields.length / 2; i++ ) {
                 results[i] = {};
             }

             // turn each entry into an object literal with the properties
             // id and formula
             for (i = 0; i < textfields.length; i++ ) {
                 field = textfields[i];

                 // aliasType was defined on the dynamically created rows above
                 results[Math.floor(i/2)][field.aliasType] = field.getValue();
             }

             return results;
         }
     });

}());
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


(function() {

Ext.ns('Zenoss.form');
/**
 * This is a special case of a text area. It is designed to take up the entire column
 * on a two column layout.
 **/
Ext.define("Zenoss.form.TwoColumnTextArea", {
    alias:['widget.twocolumntextarea'],
    extend:"Ext.form.TextArea",
     constructor: function(config) {
         config.width = 500;
         config.height = 220;
         Zenoss.form.TwoColumnTextArea.superclass.constructor.apply(this, arguments);
     }
 });

})();
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


/* package level */
(function() {

    Ext.ns('Zenoss.form');
    /**
     * This is a display field that takes an array as its value and
     * renders them with one element per line
     **/
    Ext.define("Zenoss.form.MultiLineDisplayField", {
        alias:['widget.multilinedisplayfield'],
        extend:"Ext.form.DisplayField",
        constructor: function(config) {
            // if a string was passed in then defer to the parents behavior
            if ((typeof config.value) != 'string') {
                config.value = config.value.join('<br />');
            }

            Zenoss.form.MultiLineDisplayField.superclass.constructor.apply(this, arguments);
        }
    });

}());
(function() { // Local scope

Ext.namespace('Zenoss.inspector');


/**
 * Manages inspector windows to ensure that only one window matching
 * `uid` is active at a time.
 */
Zenoss.inspector.SingleInstanceManager = Ext.extend(Object, {
    _instances: null,
    constructor: function() {
        this._instances = {};
    },
    register: function(uid, instance) {
        this.remove(uid);
        this._instances[uid] = instance;
        instance.on('destroy', function() { delete
        this._instances[uid]; }, this);
    },
    get: function(uid) {
        return this._instances[uid];
    },
    remove: function(uid) {
        Ext.destroyMembers(this._instances, uid);
    }
});


/**
 * Represents a single item in the inspector panel.
 *
 * config:
 * - valueTpl An XTemplate that can be used to render the field. Will
 *            be passed the data that is passed to the inspector.
 */
Ext.define('Zenoss.inspector.InspectorProperty', {
    alias: ['widget.inspectorprop'],
    extend: 'Ext.Container',
    constructor: function(config) {
        config = Ext.applyIf(config || {}, {
            cls: 'inspector-property',
            layout: 'anchor',
            items: [
                {
                    cls: 'inspector-property-label',
                    ref: 'labelItem',
                    xtype: 'label',
                    text: config.label ? config.label + ':' : ''
                },
                {
                    cls: 'inspector-property-value',
                    ref: 'valueItem',
                    text: config.value || '',
                    xtype: 'panel',
                    tpl: config.valueTpl || '{.}'
                }
            ]
        });
        this.callParent(arguments);
    },
    setValue: function(t) {
        this.valueItem.update(t);
    },
    setLabel: function(t) {
        this.labelItem.setText(t + ':');
    }
});


Ext.define('Zenoss.inspector.BaseInspector', {
    extend: 'Ext.Panel',
    constructor: function(config) {
        config = Ext.applyIf(config || {}, {
            defaultType: 'devdetailitem',
            layout: 'anchor',
            bodyBorder: false,
            items: [],
            titleTpl: '<div class="name">{name}</div>'
        });

        config.items = [
            {
                layout: 'hbox',
                cls: 'inspector-header',
                ref: 'headerItem',
                items: [
                    {
                        cls: 'header-icon',
                        ref: 'iconItem',
                        xtype: 'panel'
                    },
                    {
                        cls: 'header-title',
                        ref: 'titleItem',
                        xtype: 'label',
                        tpl: config.titleTpl
                    }
                ]
            },
            {
                xtype: 'container',
                cls: 'inspector-body',
                autoEl: 'div',
                layout: 'anchor',
                ref: 'bodyItem',
                defaultType: 'inspectorprop',
                items: config.items
            }
        ];

        this.callParent(arguments);
    },
    setIcon: function(url) {
        if (this.headerItem.iconItem.getEl()) {
            this.headerItem.iconItem.getEl().setStyle(
                'background-image', 'url(' + url + ')'
            );
        } else {
            this.headerItem.iconItem.update(Ext.String.format('<img height="43px" src="{0}" />', url));
        }
    },
    /**
     * Overwrite to add any properties dynamically from the data. Must
     * return true if added any.
     */
    addNewDataItems: function(data) {
        return false;
    },
    update: function(data) {

        if (this.addNewDataItems(data)) {
            this.doLayout();
        }

        // update all the children that have templates
        var self = this;
        this.cascade(function(item) {
            if (item != self && item.tpl) {
                item.data = data;
                item.update(data);
            }

            return true;
        });
        if (data.icon) {
            this.setIcon(data.icon);
        }

        if (this.ownerCt) {
            this.ownerCt.doLayout();
        }
        else {
            this.doLayout();
        }

    },
    /**
     * Add a property to the inspector panel for display.
     *@param {string} label
     *@param {string} id The key from the data to display.
     */
    addProperty: function(label, id) {
        this.addPropertyTpl(label, '{[values.' + id + ' || ""]}');
    },
    /**
     * Add a property to the inspector panel using a template to display.
     * @param {string} label label of template.
     * @param {string} tpl A string in XTemplate format to display
     * this property. Data values are in `values`.
     */
    addPropertyTpl: function(label, tpl) {
        this.bodyItem.add({
            xtype: 'inspectorprop',
            label: label,
            valueTpl: tpl
        });
    }
});

/**
 * An inspector that gets its data via a directFn remote call.
 */
Zenoss.inspector.DirectInspector = Ext.extend(Zenoss.inspector.BaseInspector, {
    _contextUid: null,
    constructor: function(config) {
        config = Ext.applyIf(config || {}, {
            directFn: Ext.emptyFn
        });

        Zenoss.inspector.DirectInspector.superclass.constructor.call(this, config);
    },
    initComponent: function() {
        Zenoss.inspector.DirectInspector.superclass.initComponent.call(this);
        this.addEvents('contextchange');
        this.on('contextchange', this._onContextChange, this);
    },
    refresh: function() {
        this.load();
    },
    load: function() {
        if (this._contextUid) {
            this.directFn(
                { uid: this._contextUid, keys: this.keys },
                function(result) {
                    if (result.success) {
                        this.fireEvent('contextchange', result.data, this);
                    }
                },
                this
            );
        }
    },
    setContext: function(uid, load) {
        this._contextUid = uid;
        load = Ext.isDefined(load) ? load : true;

        if (load) {
            this.load();
        }
    },
    _onContextChange: function(data) {
        this.onData(data);
    },
    onData: function(data) {
        this.update(data);
    }
});

Ext.define('Zenoss.inspector.DeviceInspector', {
    alias: ['widget.deviceinspector'],
    extend: 'Zenoss.inspector.DirectInspector',
    constructor: function(config) {
        config = Ext.applyIf(config || {}, {
            directFn: Zenoss.remote.DeviceRouter.getInfo,
            keys: ['ipAddress', 'device', 'deviceClass'],
            cls: 'inspector',
            titleTpl: '<div class="name"><a href="{uid}" target="_top">{name}</a></div><div class="info">{[Zenoss.render.DeviceClass(values.deviceClass.uid)]}</div><div class="info">{[Zenoss.render.ipAddress(values.ipAddress)]}</div>'
        });
        this.callParent(arguments);

        this.addPropertyTpl(_t('Events'), '{[Zenoss.render.events(values.events, 4)]}');
        this.addPropertyTpl(_t('Device Status'), '{[Zenoss.render.pingStatus(values.status)]}');
        this.addProperty(_t('Production State'), 'productionState');
        this.addPropertyTpl(_t('Location'), '{[(values.location && values.location.name) || ""]}');
    }
});


Ext.define('Zenoss.inspector.ComponentInspector', {
    alias: ['widget.componentinspector'],
    extend: 'Zenoss.inspector.DirectInspector',
    constructor: function(config) {
        config = Ext.applyIf(config || {}, {
            directFn: Zenoss.remote.DeviceRouter.getInfo,
            keys: ['ipAddress', 'device'],
            cls: 'inspector',
            titleTpl: '<div class="name"><a href="{uid}" target="_top">{name}</a></div><div class="info"><a href="{[values.device.uid]}" target="_top">{[values.device.name]}</a></div><div class="info">{[Zenoss.render.ipAddress(values.ipAddress)]}</div>'
        });

        config.items = [(
            {
                label: _t('Events'),
                valueTpl: '{[Zenoss.render.events(values.events, 4)]}'
            }
        )];

        this.callParent(arguments);
    },
    update: function(data) {
        // our template relies on a device being present
        if (!data.device) {
            data.device = { };
        }
        this.callParent(arguments);
    }
});

var windowManager = new Zenoss.inspector.SingleInstanceManager();
Zenoss.inspector.createWindow = function(uid, xtype, x, y) {

    var win = new Ext.Window({
        x: (x || 0),
        y: (y || 0),
        cls: 'inspector-window',
        plain: true,
        frame: false,
        constrain: true,
        model: false,
        layout: 'fit',
        width: 300,
        items: [{
            xtype: xtype,
            ref: 'panelItem'
        }]
    });

    windowManager.register(uid, win);
    return win;
};

Zenoss.inspector.registeredInspectors = {
    device: 'deviceinspector'
};

Zenoss.inspector.registerInspector = function(inspector_type, inspector_xtype) {
    Zenoss.inspector.registeredInspectors[inspector_type.toLowerCase()] = inspector_xtype;
};

Zenoss.inspector.show = function(uid, x, y) {
    Zenoss.remote.DeviceRouter.getInfo({ uid: uid }, function(result) {
        if (result.success) {
            // Grasping at straws but assume it's a component unless otherwise stated
            var xtype = 'componentinspector';

            var itype = result.data.inspector_type || result.data.meta_type;
            if (itype) {
                itype = itype.toLowerCase();
                if (Zenoss.inspector.registeredInspectors[itype]) {
                    xtype = Zenoss.inspector.registeredInspectors[itype];
                }
            }
            var win = Zenoss.inspector.createWindow(uid, xtype, x, y);
            win.panelItem.setContext(uid, false);
            win.panelItem.update(result.data);
            win.show();
            win.toFront();
        }
    });
};

})();
(function() {

    var directStoreWorkaroundListeners = {
        beforedestroy: function() {
            // This is to work around a bug in Sencha 4.x:
            // http://www.sencha.com/forum/archive/index.php/t-136583.html?s=0737c51cf4da51fa8cb875c351c5b2b4
            this.bindStore(null);
        },
        afterrender: function(comp, eOpts) {
            // TODO: why does this get called twice?
            this.getStore().load();
        }
    };


    var ZF = Ext.ns('Zenoss.form.rule'),
         unparen=/^\((.*)\)$/,
         nested=/\)( and | or )\(/,
         conjunctions_inverse = {};

    ZF.CONJUNCTIONS = {
        any: {
            text: _t('any'),
            tpl: ' or '
        },
        all: {
            text: _t('all'),
            tpl: ' and '
        }
    };

    var buttons = function(scope) {
        return [{
            xtype: 'button',
            ref: 'buttonAdd',
            iconCls: 'add',
            handler: function() {
                var realowner = scope.ownerCt,
                idx = realowner.items.indexOf(scope);
                var clause = realowner.insert(idx + 1, {
                    xtype: 'ruleclause',
                    nestedRule: scope,
                    builder: scope.getBuilder()
                });
                realowner.doComponentLayout();
                clause.subject.focus();
            },
            scope: scope
        },{
            xtype: 'button',
            ref: 'buttonDelete',
            iconCls: 'delete',
            handler: function() {
                scope.ownerCt.remove(scope, true /* autoDestroy */);
                scope.getBuilder().fireEvent('rulechange', scope);
            },
            scope: scope
        },{
            xtype: 'button',
            ref: 'buttonSubclause',
            iconCls: 'classify',
            handler: function() {
                var realowner = scope.ownerCt,
                idx = realowner.items.indexOf(scope);
                realowner.insert(idx + 1, {
                    xtype: 'nestedrule',
                    ruleBuilder: scope.getBuilder()
                });
                realowner.doComponentLayout();
            },
            scope: scope
        }];
    };

    ZF.CONJUNCTION_STORE = [];
    for (var conjunction in ZF.CONJUNCTIONS) {
        if (ZF.CONJUNCTIONS.hasOwnProperty(conjunction)) {
            var conj = ZF.CONJUNCTIONS[conjunction];
            ZF.CONJUNCTION_STORE.push([conjunction, conj.text]);
            conjunctions_inverse[Ext.String.trim(conj.tpl)] = conjunction;
        }
    }


    /*
     *  The order of the comparisons in the following object matters. The
     *  templates are used to create regular expressions where the {#} substitutions
     *  get replaced with '(.*)'. When loading a clause, the following object
     *  is iterated over and the first matching regular expression gets used to
     *  parse the clause.
     */
    ZF.COMPARISONS = {
        doesnotcontain: {
            text: _t('does not contain'),
            tpl: '{1} not in {0}'
        },
        doesnotstartwith: {
            text: _t('does not start with'),
            tpl: 'not {0}.startswith({1})'
        },
        doesnotendwith: {
            text: _t('does not end with'),
            tpl: 'not {0}.endswith({1})'
        },
        contains: {
            text: _t('contains'),
            tpl: '{1} in {0}'
        },
        startswith: {
            text: _t('starts with'),
            tpl: '{0}.startswith({1})'
        },
        endswith: {
            text: _t('ends with'),
            tpl: '{0}.endswith({1})'
        },
        equals: {
            text: _t('equals'),
            tpl: '{0} == {1}'
        },
        doesnotequal: {
            text: _t('does not equal'),
            tpl: '{0} != {1}'
        },
        lessthan: {
            text: _t('is less than'),
            tpl: '{0} < {1}',
            field: {xtype: 'numberfield'}
        },
        greaterthan: {
            text: _t('is greater than'),
            tpl: '{0} > {1}',
            field: {xtype: 'numberfield'}
        },
        lessthanorequalto: {
            text: _t('is less than or equal to'),
            tpl: '{0} <= {1}',
            field: {xtype: 'numberfield'}
        },
        greaterthanorequalto: {
            text: _t('is greater than or equal to'),
            tpl: '{0} >= {1}',
            field: {xtype: 'numberfield'}
        }
    };
    ZF.COMPARISON_STORE = [];
    var comparison_patterns = {};
    for (var comparison in ZF.COMPARISONS) {
        if (ZF.COMPARISONS.hasOwnProperty(comparison)) {
            var cmp = ZF.COMPARISONS[comparison];
            ZF.COMPARISON_STORE.push([comparison, cmp.text]);
            comparison_patterns[comparison] = new RegExp(
                cmp.tpl.replace('(', '\\(')
                       .replace(')', '\\)')
                       .xsplit(/\{\d+\}/)
                       .join('(.*)'));
        }
    }

    Ext.define("Zenoss.form.rule.RuleClause", {
        alias:['widget.ruleclause'],
        extend:"Ext.Toolbar",
        constructor: function(config) {
            config = Ext.applyIf(config||{}, {
                cls: 'rule-clause',
                items: [{
                    ref: 'subject',
                    xtype: 'combo',
                    autoSelect: true,
                    allowBlank: false,
                    editable: false,
                    forceSelection: true,
                    triggerAction: 'all',
                    store: [[null,null]],
                    listConfig: {
                        resizable: true,
                        maxWidth:200,
                        maxHeight: 250
                    },
                    getSubject: Ext.bind(function() {
                        return this.getBuilder().subject_map[this.subject.getValue()];
                    }, this),
                    listeners: {
                        change: function() {
                            // when opening a second window this
                            // change fires before the component is rendered
                            if (!this.subject) {
                                return;
                            }
                            // Get the associated subject
                            var subject = this.subject.getSubject(),
                                comparisons = [];
                            this.comparison.reset();
                            // Update comparisons
                            if (subject.comparisons) {
                                Ext.each(subject.comparisons, function(cmp) {
                                    var c = ZF.COMPARISONS[cmp];
                                    if (!c) {
                                        return;
                                    }
                                    comparisons.push([cmp, c.text]);
                                });
                            } else {
                                comparisons = ZF.COMPARISON_STORE;
                            }

                            this.comparison.store.loadData(comparisons);
                            this.comparison.setValue(comparisons[0][0]);
                            this.getBuilder().fireEvent(
                                'rulechange',
                                this
                            );
                        },
                        scope: this
                    }
                },{
                    ref: 'comparison',
                    xtype: 'combo',
                    autoSelect: true,
                    editable: false,
                    allowBlank: false,
                    store: ZF.COMPARISON_STORE,
                    value: ZF.COMPARISON_STORE[0][0],
                    forceSelection: true,
                    triggerAction: 'all',
                    listConfig: {
                        maxWidth:200
                    },
                    listeners: {
                        change: function() {
                            var cmp = ZF.COMPARISONS[this.comparison.getValue()],
                                field = this.subject.getSubject().field || (cmp && cmp.field) || {xtype:'textfield'},
                                idx = Ext.Array.indexOf(this.items.items, this.predicate),
                                oldvalue = this.predicate.getValue(),
                                oldxtype = this.predicate.xtype;
                            this.remove(this.predicate);
                            this.insert(idx, Ext.apply({
                                ref: 'predicate',
                                allowBlank: false,
                                width: 150,
                                listeners: {
                                    change: function() {
                                        this.getBuilder().fireEvent(
                                            'rulechange',
                                            this
                                        );
                                    },
                                    scope: this
                                }
                            }, field));
                            if (typeof oldvalue != 'undefined' && this.predicate.xtype == oldxtype) {
                                this.predicate.setValue(oldvalue);
                            }
                            this.doComponentLayout();
                            this.getBuilder().fireEvent(
                                'rulechange',
                                this
                            );
                            this.predicate.focus();
                        },
                        scope: this
                    }
                },{
                    ref: 'predicate',
                    xtype: 'textfield',
                    width: 150,
                    listeners: {
                        change: function() {
                            this.getBuilder().fireEvent(
                                'rulechange',
                                this
                            );
                        },
                        scope: this
                    }
                },'->']
            });
            Ext.each(buttons(this), function(btn) {
                config.items.push(btn);
            });
            this.callParent([config]);
            var subjects = this.getBuilder().subject_store;
            this.subject.store.loadData(subjects);
            this.subject.setValue(subjects[0][0]);
            this.on('added', function(){
                this.getBuilder().fireEvent('rulechange', this);
            }, this);
        },
        getValue: function() {
            var comparison = this.comparison.getValue(),
                sub = this.subject.getValue(),
                pred = this.predicate.getValue();
            if (!comparison || !sub || Ext.isEmpty(pred)) { return; }
            var cmp = ZF.COMPARISONS[comparison];
            var clause = Ext.String.format(cmp.tpl, this.getBuilder().prefix + sub, Ext.encode(pred));
            return Ext.String.format("({0})", clause);
        },
        setValue: function(expression) {
            for (var cmp in comparison_patterns) {
                if (comparison_patterns.hasOwnProperty(cmp)) {
                    var pat = comparison_patterns[cmp];
                    if (pat.test(expression)) {
                        var vals = pat.exec(expression).slice(1),
                            spots = pat.exec(ZF.COMPARISONS[cmp].tpl).slice(1),
                            sorted = Ext.zip.apply(this, Ext.zip(spots, vals).sort())[1],
                            subject = sorted[0],
                            value = sorted[1],
                            cleansub = subject.replace(
                                new RegExp("^"+this.getBuilder().prefix), '');

                        this.subject.setValue(cleansub);
                        this.comparison.setValue(cmp);
                        this.predicate.setValue(Ext.decode(value));
                        break;
                    }
                }
            }
        },
        getBuilder: function() {
            if (!this.builder) {
                this.builder = this.nestedRule.ruleBuilder || this.findParentByType('rulebuilder', true);
            }
            return this.builder;
        }
    });



    ZF.changeListener = function(me, cmp) {
        var items = this.items.items;

        // If we're somewhere in the middle of initialization don't do anything
        if (items.length===0) {
            return;
        }

        var item = items[0],
            delbtn = item instanceof ZF.NestedRule ?
                     item.items.items[0].buttonDelete :
                     item.buttonDelete;

        // Disable the delete button if only one at this level
        if (items.length==1) {
            delbtn.disable();
        } else if (items.length > 1){
            delbtn.enable();
        }

        // Disable the nested button if it would mean more than 4 deep
        var i = 0, btn;
        while (item = item.findParentByType('nestedrule')) {
            i++;
            if (i>=4) {
                if (btn = cmp.buttonSubclause) {
                    btn.disable();
                }
                break;
            }
        }
    };

    Ext.define("Zenoss.form.rule.NestedRule", {
        alias:['widget.nestedrule'],
        extend:"Ext.Container",
        constructor: function(config) {
            config = Ext.applyIf(config||{}, {
                showButtons: true,
                cls: 'nested-rule',
                items: [{
                    xtype: 'toolbar',
                    cls: 'rule-clause nested-rule-header',

                    items: [{
                        ref: '../conjunction',
                        xtype: 'combo',
                        width: 60,
                        store: ZF.CONJUNCTION_STORE,
                        editable: false,
                        allowBlank: false,
                        forceSelection: true,
                        triggerAction: 'all',
                        value: 'all',
                        listConfig: {
                            maxWidth:60
                        },
                        listeners: {
                            change: function() {
                                this.getBuilder().fireEvent(
                                    'rulechange',
                                    this
                                );
                            },
                            scope: this
                        }
                    },{
                        xtype: 'label',  
                        html: _t('of the following rules:'),
                        style: 'margin-left: 7px; font-size: 12px; color: #444'
                    }]
                },{
                    ref: 'clauses',
                    xtype: 'container',
                    cls: 'rule-clause-container',
                    items: {
                        xtype: 'ruleclause',
                        nestedRule: this
                    },
                    listeners: {
                        add: ZF.changeListener,
                        remove: ZF.changeListener
                    }
                }]
            });
            if (config.showButtons) {
                var items = config.items[0].items;
                items.push('->');
                Ext.each(buttons(this), function(btn) {
                    items.push(btn);
                });
            }
            this.callParent([config]);
        },
        getBuilder: function() {
            if (!this.builder) {
                this.builder = this.findParentByType('rulebuilder', true);
            }
            return this.builder;
        },
        getValue: function() {
            var values = [],
                joiner = ZF.CONJUNCTIONS[this.conjunction.getValue()].tpl,
                result;
            Ext.each(this.clauses.items.items, function(clause) {
                var value = clause.getValue();
                if (value) {
                    values.push(value);
                }
            }, this);
            result = values.join(joiner);
            if (values.length > 1) {
                result = Ext.String.format('({0})', result);
            }
            return result;
        },
        setValue: function(expression) {
            var c, q, i=0, p=0, tokens=[], token=[],
                funcflag=false;
            c = expression.charAt(i);
            var savetoken = function() {
                var v = Ext.String.trim(token.join(''));
                if (v) {
                    tokens.push(v);
                }
                token = [];
            };
            while (c) {
                //token.push(c);
                // Don't deal with contents of string literals
                if (c=='"'||c=='\'') {
                    q = c;
                    token.push(c);
                    for (;;) {
                        i++;
                        c = expression.charAt(i);
                        token.push(c);
                        if (c===q) {
                            // Closing quote
                            break;
                        }
                        if (c === '\\') {
                            // Skip escaped chars
                            i++;
                            token.push(expression.charAt(i));
                        }
                    }
                } else if (c=="("||c==")"){
                    if (p===0) {
                        savetoken();
                    }
                    token.push(c);
                    if (c=='(') {
                        var prev = expression.charAt(i-1);
                        if (i>0 && prev!=' ' && prev!='(') {
                            funcflag = true;
                        } else {
                            p++;
                        }
                    } else if (c==')') {
                        if (funcflag) {
                            funcflag = false;
                        } else {
                            p--;
                        }
                    }
                    if (p===0) {
                        savetoken();
                    }
                } else {
                    token.push(c);
                }
                i++;
                c = expression.charAt(i);
            }
            savetoken();

            if (tokens) {
                this.clauses.removeAll();
                var conjunction, rule;

                Ext.each(tokens, function(t) {
                    if (t) {
                        if (conjunction = conjunctions_inverse[t]){
                             this.conjunction.setValue(conjunction);
                             return;
                        } else if (nested.test(t)) {
                            // Nested rule
                            rule = this.clauses.add({xtype:'nestedrule', ruleBuilder: this.ruleBuilder});
                        } else {
                            // Clause
                            rule = this.clauses.add({xtype: 'ruleclause', nestedRule: this});
                        }
                        var clause = t;
                        try {
                            clause = unparen.exec(t)[1];
                        } catch(ignored) {}
                        rule.setValue(clause);
                    }
                }, this);
            }
        }
    });



    Ext.define("Zenoss.form.rule.RuleBuilder", { 
        alias:['widget.rulebuilder'],
        extend:"Ext.form.FieldContainer",
        constructor: function(config) {
            config = Ext.applyIf(config||{}, {
                cls: 'rule-builder',
                prefix: '',
                items: [{
                    ref: 'rootrule',
                    xtype: 'nestedrule',
                    showButtons: false,
                    ruleBuilder: this
                }]
            });
            this.subject_store = [];
            this.subject_map = {};
            Ext.each(config.subjects, function(subject) {
                if (!Ext.isObject(subject)) {
                    subject = {value: subject};
                }
                this.subject_store.push([subject.value, subject.text || subject.value]);
                this.subject_map[subject.value] = subject;
            }, this);
            this.callParent([config]);
            this.addEvents('rulechange');
        },
        getValue: function() {
            var result = this.rootrule.getValue();
            if (result && nested.test(result)) {
                // There will be one extra paren set wrapping the clause as a
                // whole that is hard to prevent earlier than this; don't save
                // it, as it will be treated as an unnecessary nested rule
                result = unparen.exec(result)[1];
            }
            return result;
        },
        setValue: function(expression) {
            if (!expression) {
                this.reset();
            } else {
                this.rootrule.setValue(expression);
            }
            this.doComponentLayout();
        },
        reset: function() {
            this.rootrule.clauses.removeAll();
            this.rootrule.clauses.add({
                xtype: 'ruleclause',
                nestedRule: this.rootrule,
                builder: this
            });
        }
    });

    Ext.define("Zenoss.form.rule.DeviceCombo",{
            extend: "Zenoss.form.SmartCombo",
            alias: ["widget.rule.devicecombo"],
            constructor: function(config){
                config = Ext.applyIf(config || {}, {
                    queryMode: 'remote',
                    directFn: Zenoss.remote.DeviceRouter.getDeviceUuidsByName,
                    root: 'data',
                    model: 'Zenoss.model.BasicUUID',
                    remoteFilter: true,
                    minChars: 3,
                    typeAhead: true,
                    valueField: 'uuid',
                    displayField: 'name',
                    forceSelection: true,
                    triggerAction: 'all',
                    editable: true,
                    autoLoad: false
                })
                this.callParent([config])
            },

            setValue: function() {
                var uuid = arguments[0];
                // uuid can be undefined, an empty string, a string containing the uuid,
                // or a BasicUUID object.  Force a reload if it is a uuid-containing string
                // and the corresponding device is not already in the combobox dropdown.
                if (uuid && Ext.isString(uuid)) {
                    this.getStore().setBaseParam("uuid", uuid);
                    if (this.getStore().getById(uuid) === null) {
                        this.getStore().load();
                    }
                }
                return this.callParent(arguments);
            }
        }
    )


    ZF.STRINGCOMPARISONS = [
        'contains',
        'doesnotcontain',
        'startswith',
        'doesnotstartwith',
        'endswith',
        'doesnotendwith',
        'equals',
        'doesnotequal'
    ];

    ZF.NUMBERCOMPARISONS = [
        'equals',
        'doesnotequal',
        'lessthan',
        'greaterthan',
        'lessthanorequalto',
        'greaterthanorequalto'
    ];

    ZF.IDENTITYCOMPARISONS = [
        'equals',
        'doesnotequal'
    ];

    ZF.LISTCOMPARISONS = [
        'contains',
        'doesnotcontain'
    ];


    Ext.apply(ZF, {
        EVENTSEVERITY: {
            text: _t('Severity'),
            value: 'severity',
            comparisons: ZF.NUMBERCOMPARISONS,
            field: {
                xtype: 'combo',
                queryMode: 'local',
                valueField: 'value',
                displayField: 'name',
                typeAhead: false,
                forceSelection: true,
                triggerAction: 'all',
                listConfig: {
                    maxWidth:200
                },
                store: new Ext.data.ArrayStore({
                    model: 'Zenoss.model.NameValue',
                    data: [[
                        _t('Critical'), 5
                    ],[
                        _t('Error'), 4
                    ],[
                        _t('Warning'), 3
                    ],[
                        _t('Info'), 2
                    ],[
                        _t('Debug'), 1
                    ],[
                        _t('Clear'), 0
                    ]]
                })
            }
        },
        PRODUCTIONSTATE: {
            text: _t('Production state'),
            value: 'productionState',
            field: {
                xtype: 'ProductionStateCombo',
                listConfig: {
                    maxWidth:200
                }
            },
            comparisons: ZF.NUMBERCOMPARISONS
        },
        DEVICEPRIORITY: {
            text: _t('Device priority'),
            value: 'priority',
            field: {
                xtype: 'PriorityCombo',
                listConfig: {
                    maxWidth:200
                }
            },
            comparisons: ZF.NUMBERCOMPARISONS
        },
        DEVICE: {
            text: _t('Device'),
            value: 'device_uuid',
            comparisons: ZF.IDENTITYCOMPARISONS,
            field: {
                xtype: 'rule.devicecombo',
                listConfig: {
                    maxWidth:200
                }
            }
        },
        DEVICECLASS: {
            text: _t('Device Class'),
            value: 'dev.device_class',
            comparisons: ZF.STRINGCOMPARISONS,
            field: {
                xtype: 'smartcombo',
                defaultListConfig: {
                    maxWidth:200
                },
                fields: ['name'],
                directFn: Zenoss.remote.DeviceRouter.getDeviceClasses,
                root: 'deviceClasses',
                listeners: directStoreWorkaroundListeners,
                typeAhead: true,
                editable: true,
                valueField: 'name',
                displayField: 'name',
                forceSelection: true
            }
        },
        SYSTEMS: {
            text: _t('Systems'),
            value: 'dev.systems',
            comparisons: ZF.LISTCOMPARISONS,
            field: {
                xtype: 'smartcombo',
                defaultListConfig: {
                    maxWidth:200
                },
                directFn: Zenoss.remote.DeviceRouter.getSystems,
                root: 'systems',
                fields: ['name'],
                listeners: directStoreWorkaroundListeners,
                typeAhead: true,
                editable: true,
                valueField: 'name',
                displayField: 'name',
                forceSelection: false
            }
        },
        DEVICEGROUPS: {
            text: _t('Device Groups'),
            value: 'dev.groups',
            comparisons: ZF.LISTCOMPARISONS,
            field: {
                xtype: 'smartcombo',
                defaultListConfig: {
                    maxWidth:200
                },
                directFn: Zenoss.remote.DeviceRouter.getGroups,
                root: 'groups',
                fields: ['name'],
                listeners: directStoreWorkaroundListeners,
                typeAhead: true,
                editable: true,
                valueField: 'name',
                displayField: 'name',
                forceSelection: false
            }
        }
    });
})();
Ext.onReady(function() {
    Ext.ns('Zenoss.eventdetail');

    /**
     * This property is used by ZenPacks and other things to specify custom
     * renderers for fields in the detail panel before the panel has
     * instantiated. Once instantiated, the panel will apply any renderers
     * found here.
     */
    if (!Zenoss.hasOwnProperty('event_detail_custom_renderers')) {
        Zenoss.event_detail_custom_renderers = {};
    }

    /**
     * This property is by ZenPacks and other things to specify custom sections
     * for the detail panel before the panel has been instantiated. The section
     * config must specify a `section_class` property which is the string name
     * of a section class ('Section', 'RepeatedSection', etc.).
     *
     * A section config may also specify `renderers` which will specify a custom
     * renderer for a field. This will override the renderer for that field for
     * the entire detail panel.
     *
     * If a section config specifies a `title` property, the title will be used
     * to toggle display of the section.
     */
    if (!Zenoss.hasOwnProperty('event_detail_custom_sections')) {
        Zenoss.event_detail_custom_sections = {};
    }


    /**
     * The header used for the top of the event detail pane.
     * WAS Zenoss.eventdetail.detail_table_template
     */
    Zenoss.eventdetail.detail_header_template = ['<table width="99%" id="evdetail_props_table">',
        '<tr><td class="dt">',_t('Resource:'),'</td>',
            '<td>',
                '<tpl if="device">',
                    '{device}',
                '</tpl>',
            '</td>',
        '</tr>',
        '<tr><td class="dt">',_t('Component:'),'</td>',
            '<td>',
                '<tpl if="component">',
                    '{component}',
                '</tpl>',
            '</td>',
        '</tr>',
        '<tr><td class="dt">',_t('Event Class:'),'</td>',
            '<td>',
                '<tpl if="eventClass">',
                    '{eventClass}',
                '</tpl>',
            '</td>',
        '</tr>',
        '<tr><td class="dt">',_t('Status:'),'</td> <td>{eventState}</td></tr>',
        '<tr><td class="dt">',_t('Message:'),'</td> <td >{message}</td></tr>',
    '</table><div style="clear:both;"></div>'];

    /**
     * The template used for regular event properties.
     * WAS: Zenoss.eventdetail.fullprop_table_template
     */
    Zenoss.eventdetail.detail_data_template = ['<table class="proptable" width="100%">',
        '<tpl for="properties">',
        '<tr class=\'{[xindex % 2 === 0 ? "even" : "odd"]}\'>',
        '<td class="proptable_key">{key}</td>',
        '<td class="proptable_value">{value}</td></tr>',
        '</tpl>',
        '</table>'];

    /**
     * Template for log messages.
     * WAS: Zenoss.eventdetail.log_table_template
     */
    Zenoss.eventdetail.detail_log_template = ['<table>',
        '<tpl for="log">',
        '<tr><td class="time">{0} {1}: </td>',
            '<td class="message">{2}</td></tr>',
        '</tpl>',
        '</table>'];


    /**
     * This class will generate HTML based on a template that simply uses named
     * properties:
     *
     *      "<p>{my_key}</p>"
     *
     */
    Zenoss.eventdetail.Section = Ext.extend(Object, {
        constructor: function(config){
            Ext.applyIf(config || {}, {
                template: Zenoss.eventdetail.detail_data_template
            });
            Ext.apply(this, config);

            Zenoss.eventdetail.Section.superclass.constructor.apply(this, arguments);
        },

        /**
         * A section is asked to generate its own HTML using this method.
         *
         * @param renderedData This is the event data after each field has been
         *                     rendered according to any renderers specified.
         *                     This contains all rendered data, not just the data
         *                     for the keys specified in this section.
         * @param eventData This is the raw event data. This is made available to
         *                  the section so that it may use it for whatever it wants.
         */
        generateHtml: function(renderedData, eventData) {
            var template = new Ext.XTemplate(this.template),
                props = {};
            Ext.each(this.keys, function(key) {
                props[key] = renderedData[key];
            });
            return template.apply(props);
        }
    });


    /**
     * This class will generate HTML based on a template that utilizes 'for'
     * and iterates over data on the 'properties' property:
     *
     *  "<tpl for="properties">
     *      <p>{key}: {value}</p>
     *   </tpl>"
     *
     */
    Zenoss.eventdetail.RepeatedSection = Ext.extend(Zenoss.eventdetail.Section, {
        constructor: function(config) {
            Ext.applyIf(config || {} , {
                generateHtml: function(renderedData, eventData) {
                    var template = new Ext.XTemplate(this.template),
                        props = {
                            properties: []
                        };
                    Ext.each(this.keys, function(key) {
                        props.properties.push({
                            key: key,
                            value: renderedData[key]
                        });
                    });
                    return template.apply(props);
                }
            });
            Zenoss.eventdetail.RepeatedSection.superclass.constructor.apply(this, arguments);
        }
    });


    /**
     * This special details section knows how to iterate over event details. Any
     * keys specified will be looked for in an event's details data.
     */
    Zenoss.eventdetail.DetailsSection = Ext.extend(Zenoss.eventdetail.RepeatedSection, {
        constructor: function(config) {
            Ext.applyIf(config || {} , {
                generateHtml: function(renderedData, eventData) {
                    var template = new Ext.XTemplate(this.template),
                        props = {
                            properties: renderedData['details']
                        },
                        details = [];

                    if (this.hasOwnProperty('keys')) {
                        Ext.each(this.keys, function(key) {
                            Ext.each(renderedData['details'], function(detail) {
                                if (detail.key == key) {
                                    details.push(detail);
                                }
                            }, this);
                        }, this);
                        props.properties = details;
                    }

                    return template.apply(props);
                }
            });
            Zenoss.eventdetail.DetailsSection.superclass.constructor.apply(this, arguments);
        }
    });


    /**
     * This panel represents the event detail panel. An initial "zenoss" config
     * is automatically loaded during instantiation in the `init` method.
     */
    Ext.define("Zenoss.DetailPanel", {
        extend:"Ext.Panel",
        alias: "widget.detailpanel",
        isHistory: false,
        layout: 'border',
        constructor: function(config){
            this.sections = [];
            this.renderers = {};
            config.onDetailHide = config.onDetailHide || Ext.emptyFn;
            config.items = [
                // Details Toolbar
                {
                    id: 'evdetail_hd',
                    region: 'north',
                    layout: 'border',
                    height: 50,
                    cls: 'evdetail_hd',
                    items: [{
                        region: 'west',
                        width: 77,
                        height:47,
                        defaults:{height:47},
                        layout: 'hbox',
                        items: [{
                            id: 'severity-icon',
                            cls: 'severity-icon'
                        },{
                            id: 'evdetail-sep',
                            cls: 'evdetail-sep'
                        }]
                    }, {
                        region: 'center',
                        id: 'evdetail-summary',
                        html: ''
                    },{
                        region: 'east',
                        id: 'evdetail-tools',
                        layout: 'hbox',
                        width: 57,
                        items: [{
                            id: 'evdetail-popout',
                            cls: 'evdetail-popout'
                        },{
                            id: 'evdetail_tool_close',
                            cls: 'evdetail_close'
                        }]
                    }]
                },

                // Details Body
                {
                    id: 'evdetail_bd',
                    region: 'center',
                    width: "90%",
                    autoScroll: true,
                    cls: 'evdetail_bd',
                    items: [   {
                        xtype:'toolbar',
                        width: "105%",
                        style: {
                            position: "relative",
                            top: -1
                        },
                        hidden: !config.showActions,
                        id: 'actiontoolbar',
                        items:[ {
                                xtype: 'tbtext',
                                text: _t('Event Actions:')
                            },
                            Zenoss.events.EventPanelToolbarActions.acknowledge,
                            Zenoss.events.EventPanelToolbarActions.close,
                            Zenoss.events.EventPanelToolbarActions.reopen,
                            Zenoss.events.EventPanelToolbarActions.unclose

                        ]
                    },
                    {
                        id: 'event_detail_properties',
                        frame: false,
                        defaults: {
                            frame: false
                        },
                        layout: {
                            type: 'table',
                            columns: 1,
                            tableAttrs: {
                                style: {
                                    width: '90%'
                                }
                            }
                        }
                    },

                    // Event Log Header
                    {
                        id: 'evdetail-log-header',
                        cls: 'evdetail-log-header',
                        hidden: false,
                        html: '<'+'hr/><'+'h2>LOG<'+'/h2>'
                    },

                    // Event Audit Form
                    {
                        xtype: 'form',
                        id: 'log-container',
                        width: '90%',
                        layout: {
                            type: 'table',
                            columns: 1
                        },
                        style: {'margin-left':'3em'},
                        hidden: false,
                        fieldDefaults: {
                            labelWidth: 1
                        },
                        items: [{
                            id: 'detail-logform-evid',
                            xtype: 'hidden',
                            name: 'evid'
                        },{
                            style: 'margin:0.75em',
                            width: 300,
                            xtype: 'textfield',
                            name: 'message',
                            hidden: Zenoss.Security.doesNotHavePermission('Manage Events'),
                            id: 'detail-logform-message'
                        },{
                            xtype: 'button',
                            type: 'submit',
                            name: 'add',
                            hidden: Zenoss.Security.doesNotHavePermission('Manage Events'),
                            text: 'Add',
                            handler: function(btn, e) {
                                var form = Ext.getCmp('log-container'),
                                vals = form.getForm().getValues(),
                                params = {
                                    evid: Ext.getCmp('')
                                };
                                Ext.apply(params, vals);
                                Zenoss.remote.EventsRouter.write_log(
                                    params,
                                    function(provider, response){
                                        Ext.getCmp(
                                            'detail-logform-message').setRawValue('');
                                        Ext.getCmp(config.id).refresh();
                                    });
                            }
                        }]
                    },

                    // Event Log Content
                    {
                        id: 'evdetail_log',
                        cls: 'log-content',
                        hidden: false,
                        autoScroll: true,
                        height: 200
                    }
                    ]
                }

            ];

            this.callParent([config]);
            this.init();
        },

        init: function() {
            var default_renderers = {
                device: function(value, sourceData) {
                    var val = sourceData.device_title;
                    if (sourceData.device_url) {
                        val = Zenoss.render.default_uid_renderer(
                            sourceData.device_url,
                            sourceData.device_title);
                        return val;
                    }
                    return Ext.htmlEncode(val);
                },
                component: function(value, sourceData) {
                    var val = sourceData.component_title;
                    if (sourceData.component_url) {
                        val = Zenoss.render.default_uid_renderer(
                            sourceData.component_url,
                            sourceData.component_title);
                        return val;
                    }
                    return Ext.htmlEncode(val);
                },
                eventClass: function(value, sourceData) {
                    return  Zenoss.render.EventClass(
                        sourceData.eventClass_url,
                        sourceData.eventClass
                    );
                },
                eventClassMapping: function(value, sourceData) {
                    if (sourceData.eventClassMapping_url) {
                        return Zenoss.render.link(null,
                            sourceData.eventClassMapping_url,
                            sourceData.eventClassMapping
                        );
                    }
                },
                Systems: function(value, sourceData) {
                    return Zenoss.render.LinkFromGridUidGroup(value);
                },


                /* We don't totally control what the source looks like, so escape any HTML*/
                eventState: function(value, sourceData) {
                    return Ext.htmlEncode(value);
                },
                summary: function(value, sourceData) {
                    return Ext.htmlEncode(value);
                },
                dedupid: function(value, sourceData) {
                    return Ext.htmlEncode(value);
                },
                message: function(value, sourceData) {
                    return Ext.htmlEncode(value);
                },
                eventClassKey: function(value, sourceData) {
                    return Ext.htmlEncode(value);
                },
                DeviceGroups: function(value, sourceData) {
                    return Zenoss.render.LinkFromGridUidGroup(value);
                },
                DeviceClass: function(value, sourceData) {
                    return Zenoss.render.LinkFromGridUidGroup(value);
                },
                Location: function(value, sourceData) {
                    return Zenoss.render.LinkFromGridUidGroup(value);
                }

            };
            Ext.apply(this.renderers, default_renderers);

            var eventInfoSection = new Zenoss.eventdetail.Section({
                id: "evdetail_props",
                cls: 'evdetail_props',
                template: Zenoss.eventdetail.detail_header_template,
                keys: ['device', 'component', 'eventClass', 'eventState', 'message']
            });
            this.addSection(eventInfoSection);

            var eventManagementSection = new Zenoss.eventdetail.RepeatedSection({
                id: "event_detail_management_section",
                title: _t("Event Management"),
                template: Zenoss.eventdetail.detail_data_template,
                keys: [ 'agent', 'component', 'dedupid', 'eventClass', 'eventClassKey',
                        'eventClassMapping', 'eventGroup', 'eventKey', 'eventState', 'evid',
                        'facility', 'message', 'ntevid', 'priority', 'severity', 'summary'
                ]
            });
            this.addSection(eventManagementSection);

            var deviceStateSection = new Zenoss.eventdetail.RepeatedSection({
                id: 'event_detail_device_state_section',
                title: _t('Device State'),
                template: Zenoss.eventdetail.detail_data_template,
                keys: [
                    'DeviceClass', 'DeviceGroups', 'DevicePriority',
                    'Location', 'Systems', 'device', 'ipAddress',
                    'monitor', 'prodState'
                ]
            });
            this.addSection(deviceStateSection);

            var eventMetaSection = new Zenoss.eventdetail.RepeatedSection({
                id: 'event_detail_meta_section',
                title: _t('Event Data'),
                template: Zenoss.eventdetail.detail_data_template,
                keys: [
                    'clearid', 'count', 'firstTime', 'lastTime',
                    'ownerid', 'stateChange'
                ]
            });
            this.addSection(eventMetaSection);

            var eventDetailsSection = new Zenoss.eventdetail.DetailsSection({
                id: 'event_detail_details_section',
                title: _t('Event Details'),
                template: Zenoss.eventdetail.detail_data_template
            });
            this.addSection(eventDetailsSection);

            this.checkCustomizations();
        },

        checkCustomizations: function() {
            // Apply any custom renderers that were registered before we loaded
            // the 'stock' sections and renderers.
            Ext.apply(this.renderers, Zenoss.event_detail_custom_renderers);

            // Add any sections that were registered before we loaded completely.
            Ext.each(Zenoss.event_detail_custom_sections, function(section) {
                if (section.hasOwnProperty('section_class')) {
                    this.addSection(section);
                }
            }, this);

            this.doLayout();
        },

        getBody: function() {
            return Ext.getCmp('event_detail_properties');
        },

        addSection: function(section) {
            if (section.hasOwnProperty('renderers')) {
                Ext.apply(this.renderers, section.renderers);
            }

            this.sections.push(section);

            if (section.hasOwnProperty('title')) {
                var section_title_config = {
                    id: section.id + '_title',
                    html: section.title + '...',
                    cls: 'show_details',
                    height: 30,
                    toggleFn: Ext.bind(this.toggleSection, this, [section.id])
                };
                this.getBody().add(section_title_config);
            }



            var content_cls = 'full_event_props';
            if (section.hasOwnProperty('cls')) {
                content_cls = section.cls;
            }
            var section_content_config = {
                layout: 'fit',
                id: section.id,
                hidden: false,
                cls: content_cls,
                // dummy html
                html: ''
            };
            this.getBody().add(section_content_config);
        },

        removeSection: function(section_id) {
            var remove_idx;
            Ext.each(this.sections, function(item, idx, sections) {
                if (item.id == section_id) {
                    remove_idx = idx;
                }
            });
            this.sections.splice(remove_idx, 1);

            Ext.getCmp(section_id).destroy();
            Ext.getCmp(section_id+'_title').destroy();
        },

        hideSection: function(section_id) {
            Ext.getCmp(section_id).hide();
        },

        showSection: function(section_id) {
            Ext.getCmp(section_id).show();
        },

        toggleSection: function(section_id) {
            var cmp = Ext.getCmp(section_id);
            if (cmp.hidden) {
                cmp.show();
            }
            else {
                /*
                 *  ZEN-2267: IE specific hack for event details sections. Event
                 *  details disappear when hide() is called.
                 */
                var innerHTML = cmp.getEl().dom.innerHTML;
                cmp.hide();
                //Repopulate this field
                if (Ext.isIE) {
                    cmp.getEl().dom.innerHTML = innerHTML;
                }
            }
        },

        findSection: function(section_id) {
            var section;
            Ext.each(this.sections, function(item) {
                if (item.id == section_id) {
                    section = item;
                }
            });
            return section;
        },

        /**
         * This method will iterate over every property of the raw event data
         * and call extractData for that key.
         *
         * @param eventData The raw event data.
         */
        renderData: function(eventData) {
            var renderedData = {};
            Ext.iterate(eventData, function(key) {
                if (key == 'details') {
                    var detailsData = [];
                    Ext.each(eventData[key], function(item) {
                        var val = this.extractData(item.key, item.value, eventData);
                        detailsData.push({
                            key: item.key,
                            value: val
                        });
                    }, this);
                    renderedData[key] = detailsData;
                }
                else {
                    renderedData[key] = this.extractData(key, eventData[key], eventData);
                }
            }, this);

            return renderedData;
        },

        /**
         * Extract rendered data from raw event data. Handles the case where a
         * key does not have a specified renderer as well as the case where
         * the value is null or undefined.
         *
         * @param key The key to use for looking up a renderer.
         * @param value The value to be rendered.
         * @param sourceData All event data.
         */
        extractData: function(key, value, sourceData) {
            var data;
            if (this.renderers.hasOwnProperty(key)) {
                data = this.renderers[key](value, sourceData);
            }
            else if (value) {
                data = value;
            }
            else {
                data = '';
            }
            return data;
        },

        setSummary: function(summary){
            var panel = Ext.getCmp('evdetail-summary');
            if (panel && panel.el){
                panel.update(summary);
            }
        },

        setSeverityIcon: function(severity){
            var panel = Ext.getCmp('severity-icon');
            this.clearSeverityIcon();
            panel.addCls(severity);
        },

        clearSeverityIcon: function() {
            var panel = Ext.getCmp('severity-icon');
            Ext.each(Zenoss.env.SEVERITIES, function(sev) {
                sev = sev[1];
                panel.removeCls(sev.toLowerCase());
            });
        },

        update: function(eventData) {

            var renderedData = this.renderData(eventData);

            this.setSummary(renderedData.summary);
            this.setSeverityIcon(Zenoss.util.convertSeverity(eventData.severity));

            // Save the evid for popping out. This is also used when submitting
            // the log form.
            Ext.getCmp('detail-logform-evid').setValue(eventData.evid);

            // Update the data sections
            Ext.each(this.sections, function(section) {
                var cmp = Ext.getCmp(section.id),
                    html;
                html = section.generateHtml(renderedData, eventData);
                cmp.update(html);
            }, this);

            // Update Logs
            var logTemplate = new Ext.XTemplate(Zenoss.eventdetail.detail_log_template),
                logHtml;
            logHtml = logTemplate.apply(eventData);
            Ext.getCmp('evdetail_log').update(logHtml);
            this.doLayout();
            if (this.showActions) {
                this.updateEventActions(eventData);
            }
        },
        updateEventActions: function(eventData) {
            Zenoss.EventActionManager.configure({
                onFinishAction: Ext.bind(this.refresh, this),

                findParams: function() {
                    var params = {
                            evids: [eventData['evid']]
                        };
                    return params;
                }
            });
            var actiontoolbar = Ext.getCmp('actiontoolbar'),
                ackButton = actiontoolbar.query("button[iconCls='acknowledge']")[0],
                closeButton = actiontoolbar.query("button[iconCls='close']")[0],
                unAckButton = actiontoolbar.query("button[iconCls='unacknowledge']")[0],
                reopenButton = actiontoolbar.query("button[iconCls='reopen']")[0],
                state = eventData['eventState'].toLowerCase();

            // disable all buttons
            ackButton.disable();
            closeButton.disable();
            unAckButton.disable();
            reopenButton.disable();

            // enable based on state (i.e. Which state can I go to from my current?)
            if (Zenoss.Security.hasPermission('Manage Events')) {
                if (state == "new") {
                    ackButton.enable();
                    closeButton.enable();
                } else if (state == "acknowledged") {
                    unAckButton.enable();
                    closeButton.enable();
                } else if ((state == "closed") || (state == "cleared"))  {
                    reopenButton.enable();
                }
            }

        },
        bind: function() {
            var close_btn = Ext.getCmp('evdetail_tool_close').getEl(),
                pop = Ext.getCmp('evdetail-popout').getEl();

            Ext.each(this.sections, function(section) {
                var cmp = Ext.getCmp(section.id+'_title');

                // A section may opt to not have a title, in which case
                // we can't provide auto-collapsing.
                if (cmp) {
                    // We remove this first because we don't want to keep
                    // adding listeners for the same event each time a new
                    // event is loaded.
                    cmp.getEl().un('click', cmp.toggleFn);
                    cmp.getEl().on('click', cmp.toggleFn);
                }

            }, this);

            if (close_btn) {
                // The 'onDetailHide' property is set by the config
                // during instantiation.
                close_btn.un('click', this.onDetailHide);
                close_btn.on('click', this.onDetailHide);
            }

            if (pop) {
                pop.un('click', this.popout, this);
                pop.on('click', this.popout, this);
            }
        },

        popout: function(){
            var evid = Ext.getCmp('detail-logform-evid').getValue(),
                url = this.isHistory ? 'viewHistoryDetail' : 'viewDetail';
            url = url +'?evid='+evid;
            window.open(url, evid.replace(/-/g,'_'),
                        "status=1,width=600,height=500,resizable=1,name=EventDetails");
        },
        wipe: function() {
            // hook to perform clean up actions when the panel is closed
        },
        load: function(event_id) {
            if (event_id !== this.event_id) {
                this.event_id = event_id;
                this.refresh();
            }
        },
        refresh: function() {
            Zenoss.remote.EventsRouter.detail({
                evid: this.event_id
            }, function(result) {
                var event = result.event[0];
                this.update(event);
                this.bind();
                this.show();
            }, this);
        }
    });
});
/*
 * triggersComponents.js
 */
(function(){

var router = Zenoss.remote.TriggersRouter;

    /**
     * @class Zenoss.triggers.TriggersModel
     * @extends Ext.data.Model
     * Field definitions for the triggers
     **/
    Ext.define('Zenoss.triggers.TriggersModel',  {
        extend: 'Ext.data.Model',
        idProperty: 'uuid',
        fields: [
            { name:'uuid'},
            { name:'enabled'},
            { name:'name'},
            { name:'rule'},
            { name:'users'},
            { name:'globalRead'},
            { name:'globalWrite'},
            { name:'globalManage'},
            { name:'userRead'},
            { name:'userWrite'},
            { name:'userManage'}
        ]
    });



Ext.define("Zenoss.trigger.TriggerSubscriptions", {
    alias:['widget.triggersSubscriptions'],
    extend:"Ext.grid.Panel",
    constructor: function(config) {
        var me = this;
        Ext.applyIf(config, {
            ref: 'grid_panel',
            border: false,
            viewConfig: {forceFit: true},
            title: _t('Triggers'),
            autoExpandColumn: 'value',
            loadMask: {msg:_t('Loading...')},
            autoHeight: true,
            deferRowRender: true,
            keys: [{
                key: [Ext.EventObject.ENTER],
                handler: function() {
                    me.addValueFromCombo();
                }
            }],
            tbar: {
                items: [{
                    xtype: 'combo',
                    ref: 'data_combo',
                    typeAhead: true,
                    triggerAction: 'all',
                    lazyRender:true,
                    width: 505,
                    queryMode: 'local',
                    store: Ext.create('Zenoss.NonPaginatedStore', {
                        root: 'data',
                        autoLoad: true,
                        idProperty: 'uuid',
                        fields:['uuid','name'],
                        directFn: router.getTriggerList,
                        autoDestroy: false,
                        listeners:  {
                            load: function() {
                                // The renderer for the trigger column depends
                                // on this store being loaded in order for it to
                                // render the name correctly.
                                me.getView().refresh();
                            }
                        }
                    }),

                    valueField: 'uuid',
                    displayField: 'name'
                },{
                        xtype: 'button',
                        text: 'Add',
                        ref: 'add_button',
                        handler: function(btn, event) {
                            me.addValueFromCombo();
                        }
                    },{
                        xtype: 'button',
                        ref: 'delete_button',
                        iconCls: 'delete',
                        handler: function(btn, event) {
                            var row = me.getSelectionModel().getSelected();
                            me.getStore().remove(row);
                            me.getView().refresh();
                        }
                    }
                ]
            },
            store: new Ext.data.JsonStore({
                model: 'Zenoss.triggers.TriggersModel',
                storeId: 'triggers_combo_store',
                autoLoad: false,
                autoDestroy: false,
                data: []
            }),

            columns: [{
                header: _t('Trigger'),
                dataIndex: 'uuid',
                flex: 1,
                renderer: function(value, metaData, record, rowIndex, colIndex, store) {
                    var toolbar = me.getDockedItems('toolbar')[0];
                    var comboStore = toolbar.data_combo.store;
                    var idx = comboStore.find('uuid', value);
                    if (idx > -1) {
                        return comboStore.getAt(idx).data.name;
                    }
                    else {
                        // instead of displaying a uuid to the user, just display
                        // something that lets them know the value is hidden.
                        return _t('(Hidden)');
                    }
                }
            }],

            selModel: Ext.create('Zenoss.SingleRowSelectionModel', {})
        });
        this.callParent(arguments);
    },
    addValueFromCombo: function() {
        var combo = this.getDockedItems('toolbar')[0].data_combo,
            val = combo.getValue(),
            rowIdx = combo.store.find('uuid', val),
            row = combo.store.getAt(rowIdx),
            existingIndex = this.getStore().findExact('uuid', val);

        if (!Ext.isEmpty(val) && existingIndex == -1) {

            var record =  Ext.create('Zenoss.triggers.TriggersModel', {uuid:val});
            this.getStore().add(record);
            combo.setValue('');
        }
        else if (existingIndex != -1) {
            Zenoss.message.error(_t('Duplicate items not permitted here.'));
        }
    },
    loadData: function(data) {
        this.getStore().loadData(data);
    }
});


})();
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


/* package level */
(function() {
    Ext.ns('Zenoss.form');
    Ext.define("Zenoss.form.SettingsGrid", {
        alias:['widget.settingsgrid'],
        extend:"Ext.form.FormPanel",
        constructor: function(config, itemsConfig) {
            config = config || {};
            var i,
                me = this,
                prop;

            // build the properties and editors
            for (i=0; i < itemsConfig.length; i++){
                prop = itemsConfig[i];
                prop.fieldLabel = prop.name;
                if (!Ext.isDefined(prop.value)) {
                    prop.value = prop.defaultValue;
                }
                if (prop.xtype == "checkbox") {
                    prop.checked = prop.value;
                }
                prop.ref = prop.id;
                prop.name = prop.id;
            }
            this.lastValues = itemsConfig;

            Ext.applyIf(config, {
                autoScroll: 'y',
                layout: 'anchor',
                fieldDefaults: {
                    labelAlign: 'top'
                },
                paramsAsHash: true,
                frame: false,
                buttonAlign: 'left',
                defaults: {
                    anchor: '95%',
                    labelStyle: 'font-size: 13px; color: #5a5a5a'
                },
                bodyStyle: 'padding: 10px',
                listeners: {
                    validitychange: function(form, isValid) {
                        me.query('button')[0].setDisabled(!isValid);
                    },
                    afterrender: function(form){
                        this.getForm().checkValidity();
                    },
                    scope: this
                },
                isDirty: function(){
                    return true;
                },
                buttons: [{
                    text: _t('Save'),
                    ref: '../savebtn',
                    formBind: true,
                    handler: function(btn){
                        var values = {};
                        Ext.each(itemsConfig, function(prop){
                            values[prop.id] = me[prop.id].getValue();
                        });
                        config.saveFn({values: values}, function(response){
                            if (response.success){
                                var message = _t("Configuration updated");
                                Zenoss.message.info(message);
                            }
                        });
                    }
                },{
                    text: _t('Cancel'),
                    ref: '../cancelbtn',
                    handler: function(btn) {
                        var form = btn.refOwner;
                        form.setInfo(form.lastValues);
                    }
                }],
                items: itemsConfig,
                setInfo: function(data) {
                    var me = this;
                    Ext.each(data, function(prop){
                        me[prop.id].setValue(prop.value);
                    });
                },

                autoHeight: true,
                viewConfig : {
                    forceFit: true
                }
            });
            this.callParent(arguments);
        }
    });


}());
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


/* package level */
(function() {
    var ZF = Ext.ns('Zenoss.form'),
        router = Zenoss.remote.DeviceRouter,
        OrganizerDropDown,
        SystemDropDown,
        LocationDropDown,
        DeviceClassDropDown,
        GroupDropDown;

    Ext.define("Zenoss.form.OrganizerDropDown", {
        extend:"Ext.form.ComboBox",
        constructor: function(config) {
            config = config || {};
            Ext.applyIf(config, {
                xtype: 'combo',
                name: 'group',
                store: new Ext.data.DirectStore({
                    directFn: config.getGroupFn,
                    root: config.getGroupRoot,
                    fields: ['name']
                }),
                valueField: 'name',
                emptyText: _t('All...'),
                displayField: 'name',
                allowBlank: true,
                forceSelection: false,
                editable: true,
                autoSelect: true,
                triggerAction: 'all',
                listConfig: {
                    resizable: true
                }
            });
            Zenoss.form.OrganizerDropDown.superclass.constructor.apply(this, arguments);
        }
    });

    Ext.define("Zenoss.form.SystemDropDown", {
        alias:['widget.systemdropdown'],
        extend:"Zenoss.form.OrganizerDropDown",
        constructor: function(config) {
            config = config || {};
            Ext.applyIf(config, {
                getGroupFn: router.getSystems,
                getGroupRoot: 'systems'
            });
            Zenoss.form.SystemDropDown.superclass.constructor.apply(this, arguments);
        }
    });


    Ext.define("Zenoss.form.GroupDropDown", {
        alias:['widget.groupdropdown'],
        extend:"Zenoss.form.OrganizerDropDown",
        constructor: function(config) {
            config = config || {};
            Ext.applyIf(config, {
                getGroupFn: router.getGroups,
                getGroupRoot: 'groups'
            });
            Zenoss.form.GroupDropDown.superclass.constructor.apply(this, arguments);
        }
    });


    Ext.define("Zenoss.form.LocationDropDown", {
        alias:['widget.locationdropdown'],
        extend:"Zenoss.form.OrganizerDropDown",
        constructor: function(config) {
            config = config || {};
            Ext.applyIf(config, {
                getGroupFn: router.getLocations,
                getGroupRoot: 'locations'
            });
            Zenoss.form.LocationDropDown.superclass.constructor.apply(this, arguments);
        }
    });


    Ext.define("Zenoss.form.DeviceClassDropDown", {
        alias:['widget.deviceclassdropdown'],
        extend:"Zenoss.form.OrganizerDropDown",
        constructor: function(config) {
            config = config || {};
            Ext.applyIf(config, {
                getGroupFn: router.getDeviceClasses,
                getGroupRoot: 'deviceClasses'
            });
            Zenoss.form.DeviceClassDropDown.superclass.constructor.apply(this, arguments);
        }
    });



}());
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


(function(){
    var router = Zenoss.remote.DeviceRouter,
        ModelerPluginForm,
        ZPROP_NAME = 'zCollectorPlugins',
        ModelerPluginPanel;
    Ext.define("Zenoss.form.ModelerPluginForm", {
        extend:"Ext.form.FormPanel",
        alias: "widget:modelerpluginform",
        constructor: function(config) {
            var me = this;
            config = config || {};
            Ext.apply(config, {
                fieldDefaults: {
                    labelAlign: 'top'
                },
                paramsAsHash: true,
                frame: false,
                autoScroll: 'y',
                defaults: {
                    labelStyle: 'font-size: 13px; color: #5a5a5a',
                    anchor: '100%'
                },
                items: [{
                    xtype: 'displayfield',
                    name: 'path',
                    id: 'modeler-plugin-path',
                    fieldLabel: _t('Path')
                },{
                    xtype: 'displayfield',
                    id: 'modeler-plugin-doc',
                    name: 'doc',
                    height: 65,
                    autoScroll: true,
                    ref: 'doc',
                    toolTip: 'Select a single plugin to see the docs',
                    fieldLabel: _t('Plugin Documentation')
                }],
                buttonAlign: 'left',
                buttons: [{
                    text: _t('Save'),
                    ref: 'savebtn',
                    disabled: Zenoss.Security.doesNotHavePermission('Manage DMD'),
                    handler: function(btn){
                        var values = me.modelerPlugins.getValue(),
                            panel = me,
                            uid = me.uid;
                        router.setZenProperty({uid:uid,
                                               zProperty: ZPROP_NAME,
                                               value:values},
                                              function(response){
                                                  if (response.success){
                                                      Zenoss.message.info('Updated Modeler Plugins');
                                                      Ext.getCmp('modeler-plugin-path').setValue(response.data.path);
                                                      panel.toggleDeleteButton(response.data.path);
                                                  }

                                              });
                    }
                },{
                    text: _t('Cancel'),
                    ref: 'cancelbtn',
                    handler: function() {
                        if (me.uid) {
                            me.setContext(me.uid);
                        }
                    }
                },{
                    text: _t('Delete Local Copy'),
                    ref: 'deleteBtn',
                    hidden: true,
                    disabled: Zenoss.Security.doesNotHavePermission('Manage DMD'),
                    handler: function(btn) {
                        var panel = me;
                        // show a confirmation
                        new Zenoss.dialog.SimpleMessageDialog({
                            title: _t('Delete zProperty'),
                            msg: _t("Are you sure you want to delete the local copy of zCollectorPlugin?"),
                            buttons: [{
                                xtype: 'DialogButton',
                                text: _t('OK'),
                                handler: function() {
                                    if (panel.uid) {
                                        router.deleteZenProperty({
                                            uid: panel.uid,
                                            zProperty: ZPROP_NAME
                                        }, function(response){
                                            panel.setContext(panel.uid);
                                        });
                                    }
                                }
                            }, {
                                xtype: 'DialogButton',
                                text: _t('Cancel')
                            }]
                        }).show();
                    }
                }],
                cls: 'device-overview-form-wrapper',
                bodyCls: 'device-overview-form'
            });
            this.callParent(arguments);
        },
        setContext: function(uid) {
            if (this.modelerPlugins) {
                this.modelerPlugins.destroy();
            }
            if(this.pluginsHeader){
                this.pluginsHeader.destroy();
            }
            if(this.panelHeaders){
                this.panelHeaders.destroy();
            }
            Ext.getCmp('modeler-plugin-doc').setValue('');
            this.uid = uid;
            // get the modeler plugins
            router.getZenProperty({
                uid: uid,
                zProperty: ZPROP_NAME
            }, Ext.bind(this.loadData, this));

            router.getModelerPluginDocStrings({
                uid: uid
            }, Ext.bind(this.loadDocs, this));

        },
        toggleDeleteButton: function(path){
            // show the delete button if locally defined
            var localPath = this.uid.replace('/zport/dmd/Devices', ''),
                deleteBtn = this.getButton("deleteBtn");

            // can't delete the root
            if (path == '/') {
                deleteBtn.hide();
                return;
            }
            if (localPath == path) {
                deleteBtn.show();
            }else{
                deleteBtn.hide();
            }
        },
        getButton: function(ref) {
            return this.query(Ext.String.format("button[ref='{0}']", ref))[0];
        },
        loadData: function(response) {
            if (response.success) {
                var data = response.data,
                    clickHandler,
                    panel = this;

                Ext.getCmp('modeler-plugin-path').setValue(data.path);
                this.toggleDeleteButton(data.path);
                clickHandler = function(select, record) {
                    // display the docs for the record clicked
                    var value = record.data.name;
                    panel.showDocFor(value);
                };
                var store = [];
                Ext.each(data.options, function(item) {
                    store.push([item]);
                });
                // add the multi select
                this.add({
                        xtype:'label',
                        text: 'Modeler Plugins:',
                        ref: 'pluginsHeader',
                        style: {'color':'#5A5A5A', 'fontWeight':'bold', 'display':'block', 'padding':'0 0 8px 0'}
                });
                this.add({
                    xtype: 'panel',
                    width: 800,
                    layout:'column',
                    ref: 'panelHeaders',
                    items: [
                    {
                        xtype:'label',
                        columnWidth: 0.515,
                        text: 'Available',
                        style: {'color':'#5A5A5A'}
                    },{
                        xtype: 'label',
                        columnWidth: 0.485,
                        text: 'Selected',
                        style: {'color':'#5A5A5A'}
                    }]
                });
                this.add({
                    name: 'modelerPlugins',
                    ref: 'modelerPlugins',
                    xtype: 'itemselector',
                    imagePath: "/++resource++zenui/img/xtheme-zenoss/icon",
                    height: 250,
                    drawUpIcon: true,
                    drawDownIcon: true,
                    drawTopIcon: true,
                    drawBotIcon: true,
                    displayField: 'name',
                    valueField: 'name',
                    store:  Ext.create('Ext.data.ArrayStore', {
                        model: 'Zenoss.model.Name',
                        data: store
                    }),
                    value: data.value,
                    listeners: {
                        afterrender: function() {
                            // HACK: have to go into the internals of MultiSelect to properly register a click
                            // handler
                            this.modelerPlugins.fromField.boundList.on('itemclick', clickHandler);
                            this.modelerPlugins.toField.boundList.on('itemclick', clickHandler);
                        },
                        scope: this
                    }
                });
                this.doLayout();

            }
        },
        showDocFor: function(plugin) {
            if (plugin && this.docs && this.docs[plugin]) {
                this.doc.setValue(this.docs[plugin]);
            }else{
                this.doc.setValue(Ext.String.format(_t('No documentation found for {0}'), plugin));
            }
        },
        loadDocs: function(response) {
            if (response.success) {
                this.docs = response.data;
            }
        }
    });


    /**
     * Place the form inside a panel for sizing
     **/
    Ext.define("Zenoss.form.ModelerPluginPanel", {
        alias:['widget.modelerpluginpanel'],
        extend:"Ext.Panel",
        constructor: function(config) {
            config = config || {};
            var form = Ext.create("Zenoss.form.ModelerPluginForm", {});
            Ext.applyIf(config, {
                layout: 'fit',
                width: 800,
                autoScroll: 'auto',
                items: [form]
            });
            this.callParent(arguments);
            this.form = form;
        },
        setContext: function(uid) {
            this.form.setContext(uid);
        }
    });




})();
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


(function(){
    var router = Zenoss.remote.DeviceRouter,
        ConfigPropertyPanel,
        zpropertyConfigs = {};

    Ext.ns('Zenoss.zproperties');
    Ext.apply(zpropertyConfigs, {
        'int': {
            xtype: 'numberfield',
            allowDecimals: false,
            width: 100
        },
        'float': {
            xtype: 'numberfield',
            width: 100
        },
        'string': {
            xtype: 'textfield'
        },
        'lines': {
            xtype: 'textarea',
            resizable: true,
            width: 300
        },
        'severity': {
            xtype: 'severity'
        },
        'boolean': {
            xtype: 'checkbox'
        },
        'password': {
            xtype: 'password'
        },
        'options': {
            xtype: 'combo',
            editable: false,
            forceSelection: true,
            autoSelect: true,
            triggerAction: 'all',
            queryMode: 'local'
        },
        'zSnmpCommunity': {
            xtype: Zenoss.Security.doesNotHavePermission('zProperties Edit') ? 'password' : 'textfield'
        },
        'zEventSeverity': {
            xtype: 'severity'
        },
        'zFailSeverity': {
            xtype: 'severity'
        },
        'zWinEventlogMinSeverity': {
            xtype: 'reverseseverity'
        }
    });

    /**
     * Allow zenpack authors to register custom zproperty
     * editors.
     **/
    Zenoss.zproperties.registerZPropertyType = function(id, config){
        zpropertyConfigs[id] = config;
    };


    function showEditConfigPropertyDialog(data, grid) {
        var handler, uid, config, editConfig, dialog, type;
        type = data.type;
        editConfig = {};

        // in case of drop down lists
        if (Ext.isArray(data.options) && data.options.length > 0 && type == 'string') {
            // make it a combo and the options is the store
            editConfig.store = data.options;
            Ext.apply( editConfig, zpropertyConfigs['options']);
        } else {
            // Try the specific property id, next the type and finally default to string
            Ext.apply( editConfig, zpropertyConfigs[data.id] || zpropertyConfigs[type] || zpropertyConfigs['string']);
        }

        // set the default values common to all configs
        Ext.applyIf(editConfig, {
            fieldLabel: _t('Value'),
            value: data.value,
            ref: 'editConfig',
            checked: data.value,
            name: data.id,
            width: 250
        });

        // lines come in as comma separated and should be saved as such
        if (type == 'lines' && Ext.isArray(editConfig.value)){
            editConfig.value = editConfig.value.join('\n');
        }

        handler = function() {
            // save the junk and reload
            var values = dialog.getForm().getForm().getValues(),
                value = values[data.id];
            if (type == 'lines') {
                if (value) {
                    // send back as an array separated by a new line
                    value = Ext.Array.map(value.split('\n'), function(s) {return Ext.String.trim(s);});
                } else {
                    // send back an empty list if nothing is set
                    value = [];
                }
            }
            var params = {
                uid: grid.uid,
                zProperty: data.id,
                value: value
            };
            Zenoss.remote.DeviceRouter.setZenProperty(params, function(response){
                if (response.success) {
                    grid.refresh();
                }
            });

        };

        // form config
        config = {
            submitHandler: handler,
            minHeight: 300,
            autoHeight: true,
            width: 500,
            title: _t('Edit Config Property'),
            listeners: {
                show: function() {
                    dialog.getForm().query("field[ref='editConfig']")[0].focus(true, 500);
                }
            },
            items: [{
                    xtype: 'displayfield',
                    name: 'name',
                    fieldLabel: _t('Name'),
                    value: data.id
                },{
                    xtype: 'displayfield',
                    name: 'path',
                    ref: 'path',
                    fieldLabel: _t('Path'),
                    value: data.path
                },{
                    xtype: 'displayfield',
                    name: 'type',
                    ref: 'type',
                    fieldLabel: _t('Type'),
                    value: data.type
                }, editConfig
            ],
            // explicitly do not allow enter to submit the dialog
            keys: {

            }
        };
        dialog = new Zenoss.SmartFormDialog(config);

        if (Zenoss.Security.hasPermission('zProperties Edit')) {
            dialog.show();
        }
    }

    /**
     * @class Zenoss.ConfigProperty.Model
     * @extends Ext.data.Model
     * Field definitions for the Config Properties
     **/
    Ext.define('Zenoss.ConfigProperty.Model',  {
        extend: 'Ext.data.Model',
        idProperty: 'id',
        fields: [
            {name: 'id'},
            {name: 'islocal'},
            {name: 'value'},
            {name: 'category'},
            {name: 'valueAsString'},
            {name: 'type'},
            {name: 'path'},
            {name: 'options'}
        ]
    });

    /**
     * @class Zenoss.ConfigProperty.Store
     * @extends Zenoss.DirectStore
     * Store for our configuration properties grid
     **/
    Ext.define("Zenoss.ConfigProperty.Store", {
        extend: "Zenoss.DirectStore",
        constructor: function(config) {
            config = config || {};
            Ext.applyIf(config, {
                model: 'Zenoss.ConfigProperty.Model',
                initialSortColumn: 'id',
                pageSize: 300,
                directFn: Zenoss.remote.DeviceRouter.getZenProperties
            });
            this.callParent(arguments);
        }
    });

    Ext.define("Zenoss.ConfigProperty.Grid", {
        alias: ['widget.configpropertygrid'],
        extend:"Zenoss.FilterGridPanel",
        constructor: function(config) {
            config = config || {};

            Zenoss.Security.onPermissionsChange(function() {
                this.disableButtons(Zenoss.Security.doesNotHavePermission('zProperties Edit'));
            }, this);

            Ext.applyIf(config, {
                stateId: config.id || 'config_property_grid',
                sm: Ext.create('Zenoss.SingleRowSelectionModel', {}),
                tbar:[

                    {
                    xtype: 'button',
                    iconCls: 'customize',
                    toolTip: _t('Customize'),
                    disabled: Zenoss.Security.doesNotHavePermission('zProperties Edit'),
                    ref: 'customizeButton',
                    handler: function(button) {
                        var grid = button.up("configpropertygrid"),
                            data,
                            selected = grid.getSelectionModel().getSelection();

                        if (Ext.isEmpty(selected)) {
                            return;
                        }
                        // single selection
                        data = selected[0].data;
                        showEditConfigPropertyDialog(data, grid);
                    }
                    }, {
                    xtype: 'button',
                    iconCls: 'refresh',
                        toolTip: _t('Refresh'),
                    ref: '../refreshButton',
                    disabled: Zenoss.Security.doesNotHavePermission('zProperties Edit'),
                    handler: function(button) {
                        var grid = button.up("configpropertygrid");
                        grid.refresh();
                    }
                    },{
                        xtype: 'button',
                        ref: '../deleteButton',
                        toolTip: _t('Delete'),
                        text: _t('Delete Local Copy'),
                        handler: function(button) {
                            var grid = button.up("configpropertygrid"),
                                data,
                                selected = grid.getSelectionModel().getSelection();
                            if (Ext.isEmpty(selected)) {
                                return;
                            }

                            data = selected[0].data;
                            if (data.islocal && data.path == '/') {
                                Zenoss.message.info(_t('{0} can not be deleted from the root definition.'), data.id);
                                return;
                            }
                            if (!data.islocal){
                                Zenoss.message.info(_t('{0} is not defined locally'), data.id);
                                return;
                            }
                            new Zenoss.dialog.SimpleMessageDialog({
                                title: _t('Delete Local Property'),
                                message: Ext.String.format(_t("Are you sure you want to delete the local copy of {0}?"), data.id),
                                buttons: [{
                                    xtype: 'DialogButton',
                                    text: _t('OK'),
                                    handler: function() {
                                        if (grid.uid) {
                                            router.deleteZenProperty({
                                                uid: grid.uid,
                                                zProperty: data.id
                                            }, function(response){
                                                grid.refresh();
                                            });
                                        }
                                    }
                                }, {
                                    xtype: 'DialogButton',
                                    text: _t('Cancel')
                                }]
                            }).show();
                        }
                    }
                ],
                store: Ext.create('Zenoss.ConfigProperty.Store', {
                }),
                columns: [{
                        header: _t("Is Local"),
                        id: 'islocal',
                        dataIndex: 'islocal',
                        width: 60,
                        sortable: true,
                        filter: false,
                        renderer: function(value){
                            if (value) {
                                return 'Yes';
                            }
                            return '';
                        }
                    },{
                        id: 'category',
                        dataIndex: 'category',
                        header: _t('Category'),
                        sortable: true,
                        renderer: function(value) {
                            return Ext.htmlEncode(value);
                        }
                    },{
                        id: 'id',
                        dataIndex: 'id',
                        header: _t('Name'),
                        width: 200,
                        sortable: true,
                        renderer: function(value) {
                            return Ext.htmlEncode(value);
                        }
                    },{
                        id: 'value',
                        dataIndex: 'valueAsString',
                        header: _t('Value'),
                        flex: 1,
                        width: 180,
                        renderer: function(v, row, record) {
                            if (Zenoss.Security.doesNotHavePermission("zProperties Edit") &&
                                record.data.id == 'zSnmpCommunity') {
                                return "*******";
                            }
                            return Ext.htmlEncode(v);
                        },
                        sortable: false
                    },{
                        id: 'path',
                        dataIndex: 'path',
                        header: _t('Path'),
                        width: 200,
                        sortable: true,
                        renderer: function(value) {
                            return Ext.htmlEncode(value);
                        }
                    }]
            });
            this.callParent(arguments);
            this.on('itemdblclick', this.onRowDblClick, this);
        },
        setContext: function(uid) {
            if (uid == '/zport/dmd/Devices'){
                this.deleteButton.setDisabled(true);
            } else {
                this.deleteButton.setDisabled(Zenoss.Security.doesNotHavePermission('zProperties Edit'));
            }

            this.uid = uid;
            // load the grid's store
            this.callParent(arguments);
        },
        onRowDblClick: function(grid, rowIndex, e) {
            var data,
                selected = this.getSelectionModel().getSelection();
            if (!selected) {
                return;
            }
            data = selected[0].data;
            showEditConfigPropertyDialog(data, this);
        },
        disableButtons: function(bool) {
            var btns = this.query("button");
            Ext.each(btns, function(btn){
                btn.setDisabled(bool);
            });
        }
    });

    Ext.define("Zenoss.form.ConfigPropertyPanel", {
        alias:['widget.configpropertypanel'],
        extend:"Ext.Panel",
        constructor: function(config) {
            config = config || {};
            this.gridId = Ext.id();
            Ext.applyIf(config, {
                layout: 'fit',
                autoScroll: 'y',
                height: 800,
                items: [{
                    id: this.gridId,
                    xtype: "configpropertygrid",
                    ref: 'configGrid',
                    displayFilters: config.displayFilters
                }]
            });
            this.callParent(arguments);
        },
        setContext: function(uid) {
            Ext.getCmp(this.gridId).setContext(uid);
        }
    });

})();
/*****************************************************************************
 *
 * Copyright (C) Zenoss, Inc. 2010, all rights reserved.
 *
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 *
 ****************************************************************************/


(function(){
    var DATE_RANGES =[
            [129600, _t('Hourly')],
            [864000, _t('Daily')],
            [3628800, _t('Weekly')],
            [41472000, _t('Monthly')],
            [62208000, _t('Yearly')]
    ],
    /*
     * If a given request is over GRAPHPAGESIZE then
     * the results will be paginated.
     * IE can't handle the higher number that compliant browsers can
     * so setting lower.
     **/
    GRAPHPAGESIZE = Ext.isIE ? 25 : 50;
    /**********************************************************************
     *
     * Swoopy
     *
     */
    function toISOTimestamp(d) {
        function pad(n){
            return n<10 ? '0'+n : n;
        }
        return d.getUTCFullYear()+'-'
            + pad(d.getUTCMonth()+1)+'-'
            + pad(d.getUTCDate())+'T'
            + pad(d.getUTCHours())+':'
            + pad(d.getUTCMinutes())+':'
            + pad(d.getUTCSeconds())+'Z';
    }

    Date.prototype.minus = function(secs) {
        return new Date(this.valueOf()-(secs*1000));
    };

    Date.prototype.toPretty = function() {
        return toISOTimestamp(this);
    };

    function fixBase64Padding(s) {
        s = s.split('=',1)[0];
        var a = [s];
        for (var i = 0; i <= 4 - (s.length % 4); i++) {
            a.push('=');
        }
        return a.join('');
    }

    var ZenGraphs = ZenGraphs || {},
        zoom_factor = 1.5,
        pan_factor = 3,
        end_re = /now-([0-9]*)s/,
        start_re = /end-([0-9]*)s/;

    Ext.ns('Zenoss');

    Zenoss.SWOOP_CALLBACKS = {};

    Zenoss.SwoopyGraph = Ext.extend(Ext.Panel, {
        constructor: function(config) {
            var cls = Ext.isGecko ? '-moz-zoom-in' :
                Ext.isWebKit ? '-webkit-zoom-in' :
                'crosshair';
            config = Ext.applyIf(config||{}, {
                html: {
                    tag: 'img',
                    src: config.graphUrl,
                    id: config.graphId,
                    style: 'cursor:' + cls
                },
                width: 607,
                cls: 'graph-panel',
                tbar: {
                    items: [{
                        xtype: 'tbtext',
                        text: config.graphTitle
                    },'->',{
                        text: '&lt;',
                        width: 67,
                        handler: Ext.bind(function(btn, e) {
                            this.onPanLeft(this);
                        }, this)
                    },{
                        text: _t('Zoom In'),
                        enableToggle: true,
                        pressed: true,
                        ref: '../zoomin',
                        handler: Ext.bind(function(btn, e) {
                            this.fireEventsToAll("zoommodechange", this, !btn.pressed);
                        }, this)
                    },{
                        text: _t('Zoom Out'),
                        ref: '../zoomout',
                        enableToggle: true,
                        handler: Ext.bind(function(btn, e) {
                            this.fireEventsToAll("zoommodechange", this, btn.pressed);
                        }, this)
                    },{
                        text: '&gt;',
                        width: 67,
                        handler: Ext.bind(function(btn, e) {
                            this.onPanRight(this);
                        }, this)
                    }]
                }
            });
            Zenoss.SwoopyGraph.superclass.constructor.call(this, config);
            this.mustUseImageUri = Ext.isIE;
        },
        initEvents: function() {
            this.addEvents("zoommodechange", "updateimage");
            Zenoss.SwoopyGraph.superclass.initEvents.call(this);
            this.on("zoommodechange", this.onZoomModeChange, this);
            this.on("updateimage", this.updateImage, this);
            this.graphEl = Ext.get(this.graphId);
            this.graphEl.on('click', this.onGraphClick, this);
            this.graphEl.on('load', function(){
                this.suspendLayouts();
                var size = this.graphEl.getSize();
                // set out panel to be the size of the graph
                // plus a little for the padding
                this.setWidth(size.width + 10);
                this.setHeight(size.height + 42);
                this.el.setHeight(size.height + 42); /* this line is for chrome */
                if (!size.width || !size.height){
                    this.showFailure();
                } else {
                    this.parseGraphParams();
                }
                this.resumeLayouts(true);
            }, this, {single:true});
        },
        showFailure: function() {
            this.failureMask = this.failureMask || Ext.DomHelper.insertAfter(this.graphEl, {
                tag: 'div',
                html: _t("There was a problem rendering this graph. Either the file does not exist or an error has occurred.  Initial graph creation can take up to 5 minutes.  If the graph still does not appear, look in the Zope log file $ZENHOME/log/event.log for errors.")
            });
            var el = Ext.fly(this.failureMask);
            var size = this.graphEl.getSize();
            if (!size.width || !size.height) {
                size = {height:150, width:500};
            }
            el.setSize(size);
            Ext.fly(this.failureMask).setDisplayed(true);
            this.graphEl.setDisplayed(false);
        },
        hideFailure: function() {
            if (this.failureMask) {
                this.graphEl.setDisplayed(true);
                Ext.fly(this.failureMask).setDisplayed(false);
            }
        },
        parseGraphParams: function(url) {
            url = url || this.graphEl.dom.src;
            var href = url.split('?'),
            gp = Ext.apply({url:href[0]}, Ext.urlDecode(href[1]));
            // Encoding can screw with the '=' padding at the end of gopts, so
            // strip and recreate it
            gp.gopts = fixBase64Padding(gp.gopts);
            gp.width = Number(gp.width);
            gp.drange = Number(gp.drange);
            gp.start = Ext.isDefined(gp.start) ? Number(start_re.exec(gp.start)[1]) : gp.drange;
            gp.end = Ext.isDefined(gp.end) ? Number(end_re.exec(gp.end)[1]) : 0;
            this.graph_params = gp;
        },
        getComment: function(start, end) {
            var now = new Date(),
                endDate = now.minus(end).toPretty(),
                startDate = now.minus(start + end).toPretty();
            var com_ctr = "\\t\\t to \\t\\t";
            var comment = startDate + com_ctr + endDate;
            comment = comment.replace(/:/g, '\\:');
            return comment;
        },
        fireEventsToAll: function() {
            if (this.linked()) {
                var args = arguments;
                Ext.each(this.refOwner.getGraphs(), function(g) {
                    g.fireEvent.apply(g, args);
                });
            } else {
                this.fireEvent.apply(this, arguments);
            }
        },
        linked: function() {
            return this.isLinked;
        },
        setLinked: function(isLinked) {
            this.isLinked = isLinked;
        },
        updateImage: function(params) {
            /*
             * params should look like:
             * {drange:n, start:n, end:n}
             */
            var gp = Ext.apply({}, params, this.graph_params);
            gp.comment = this.getComment(gp.start, gp.end);
            gp.end = 'now-' + gp.end + 's';
            gp.start = 'end-' + gp.start + 's';
            this.sendRequest(gp);
        },
        sendRequest: function(params) {
            var url = params.url,
                swoopie = this;
            delete params.url;
            params.getImage = null;
            if (this.mustUseImageUri === true) {
                params.getImage = true;
            }
            var now = new Date().getTime();
            var graphid = now + '_' + this.graphId;
            params.graphid = graphid;

            var fullurl = Ext.urlAppend(url, Ext.urlEncode(params));

            if (this.mustUseImageUri === true) {
                // IE 6 and 7 Cannoy display data:image stuff in image
                // src. If it's one of those browsers,
                // skip the SWOOP stuff and just set the image src.
                this.graphEl.dom.src = fullurl;
                this.parseGraphParams(fullurl);
            } else {
                Zenoss.SWOOP_CALLBACKS[graphid] = Ext.bind(function(packet) {
                    var ob = Ext.decode(packet);
                    if (ob.success) {
                        this.hideFailure();
                        this.graphEl.dom.src = "data:image/png;base64," + ob.data;
                        this.parseGraphParams(fullurl);
                    } else {
                        this.showFailure();
                    }
                    // Clean up callbacks and script tags
                    delete Zenoss.SWOOP_CALLBACKS[graphid];
                    Ext.get(graphid).remove();
                }, this);
                var sc = Ext.DomHelper.createDom({
                    tag: 'script',
                    id: graphid,
                    type: 'text/javascript',
                    src: fullurl
                });

                Ext.getDoc().dom.getElementsByTagName('head')[0].appendChild(sc);
            }

        },
        onPanLeft: function(graph) {
            var gp = this.graph_params;
            var delta = Math.round(gp.drange/pan_factor);
            var newend = gp.end + delta > 0 ? gp.end + delta : 0;
            this.fireEventsToAll("updateimage", {end:newend});
        },
        onPanRight: function(graph) {
            var gp = this.graph_params;
            var delta = Math.round(gp.drange/pan_factor);
            var newend = gp.end - delta > 0 ? gp.end - delta : 0;
            this.fireEventsToAll("updateimage", {end:newend});
        },
        onZoomModeChange: function(graph, zoomOut) {
            this.zoomout.toggle(zoomOut);
            this.zoomin.toggle(!zoomOut);
            var dir = zoomOut ? 'out' : 'in',
                cls = Ext.isGecko ? '-moz-zoom-'+dir :
                (Ext.isWebKit ? '-webkit-zoom-'+dir : 'crosshair');
            this.graphEl.setStyle({'cursor': cls});
        },
        doZoom: function(xpos, factor) {
            var gp = this.graph_params;
            if (xpos < 0 || xpos > gp.width) {
                return;
            }
            var drange = Math.round(gp.drange/factor),
                delta = ((gp.width/2) - xpos) * (gp.drange/gp.width) + (gp.drange - drange)/2,
                end = Math.round(gp.end + delta >= 0 ? gp.end + delta : 0);
            this.fireEventsToAll("updateimage", {
                drange: drange,
                start: drange,
                end: end
            });
        },
        onGraphClick: function(e) {
            var graph = e.getTarget(null, null, true),
                x = e.getPageX() - graph.getX() - 67,
            func = this.zoomin.pressed ? this.onZoomIn : this.onZoomOut;
            func.call(this, this, x);
        },
        onZoomIn: function(graph, xpos) {
            this.doZoom(xpos, zoom_factor);
        },
        onZoomOut: function(graph, xpos) {
            this.doZoom(xpos, 1/zoom_factor);
            }
        });

    /**********************************************************************
     *
     * Graph Panel
     *
     */
    var router = Zenoss.remote.DeviceRouter,
        GraphPanel,
        DRangeSelector,
        GraphRefreshButton,
        tbarConfig;

    Ext.define("Zenoss.form.GraphRefreshButton", {
        alias:['widget.graphrefreshbutton'],
        extend:"Zenoss.RefreshMenuButton",
        constructor: function(config) {
            config = config || {};
            var menu = {
                xtype: 'statefulrefreshmenu',
                id: config.stateId || Ext.id(),
                trigger: this,
                items: [{
                    cls: 'refreshevery',
                    text: 'Refresh every'
                },{
                    xtype: 'menucheckitem',
                    text: '1 minute',
                    value: 60,
                    group: 'refreshgroup'
                },{
                    xtype: 'menucheckitem',
                    text: '5 minutes',
                    value: 300,
                    group: 'refreshgroup'
                },{
                    xtype: 'menucheckitem',
                    text: '10 Minutes',
                    value: 600,
                    group: 'refreshgroup'
                },{
                    xtype: 'menucheckitem',
                    text: '30 Minutes',
                    checked: true,
                    value: 1800,
                    group: 'refreshgroup'
                },{
                    xtype: 'menucheckitem',
                    text: '1 Hour',
                    value: 3600,
                    group: 'refreshgroup'
                },{
                    xtype: 'menucheckitem',
                    text: 'Manually',
                    value: -1,
                    group: 'refreshgroup'
                }]
            };
            Ext.apply(config, {
                menu: menu
            });
            this.callParent(arguments);
        }
    });



    Ext.define("Zenoss.form.DRangeSelector", {
        alias:['widget.drangeselector'],
        extend:"Ext.form.ComboBox",
        constructor: function(config) {
            config = config || {};
            Ext.apply(config, {
                fieldLabel: _t('Range'),
                    name: 'ranges',
                    editable: false,
                    forceSelection: true,
                    autoSelect: true,
                    triggerAction: 'all',
                    value: 129600,
                    queryMode: 'local',
                    store: new Ext.data.ArrayStore({
                        id: 0,
                        model: 'Zenoss.model.IdName',
                        data: DATE_RANGES
                    }),
                    valueField: 'id',
                    displayField: 'name'
            });
            this.callParent(arguments);
        }
    });


    tbarConfig = [{
                    xtype: 'tbtext',
                    text: _t('Performance Graphs')

                }, '-', '->', {
                    xtype: 'drangeselector',
                    ref: '../drange_select',
                    listeners: {
                        select: function(combo, records, index){
                            var value = records[0].data.id,
                                panel = combo.refOwner;

                            panel.setDrange(value);
                        }
                    }
                },'-', {
                    xtype: 'button',
                    ref: '../resetBtn',
                    text: _t('Reset'),
                    handler: function(btn) {
                        var panel = btn.refOwner;
                        panel.setDrange();
                    }
                },'-',{
                    xtype: 'tbtext',
                    text: _t('Link Graphs?:')
                },{
                    xtype: 'checkbox',
                    ref: '../linkGraphs',
                    checked: true,
                    listeners: {
                        change: function(chkBx, checked) {
                            var panel = chkBx.refOwner;
                            panel.setLinked(checked);
                        }
                    }
                }, '-',{
                    xtype: 'graphrefreshbutton',
                    ref: '../refreshmenu',
                    stateId: 'graphRefresh',
                    iconCls: 'refresh',
                    text: _t('Refresh'),
                    handler: function(btn) {
                        if (btn) {
                            var panel = btn.refOwner;
                            panel.resetSwoopies();
                        }
                    }
                }];

    Ext.define("Zenoss.form.GraphPanel", {
        alias:['widget.graphpanel'],
        extend:"Ext.Panel",
        constructor: function(config) {
            config = config || {};
            // default to showing the toolbar
            if (!Ext.isDefined(config.showToolbar) ) {
                config.showToolbar = true;
            }
            if (config.showToolbar){
                config.tbar = tbarConfig;
            }
            Ext.applyIf(config, {
                drange: 129600,
                isLinked: true,
                // images show up after Ext has calculated the
                // size of the div
                bodyStyle: {
                    overflow: 'auto'
                },
                directFn: router.getGraphDefs
            });
            Zenoss.form.GraphPanel.superclass.constructor.apply(this, arguments);
        },
        setContext: function(uid) {
            // remove all the graphs
            this.removeAll();
            this.lastShown = 0;

            var params = {
                uid: uid,
                drange: this.drange
            };
            this.uid = uid;
            this.directFn(params, Ext.bind(this.loadGraphs, this));
        },
        loadGraphs: function(result){
            if (!result.success){
                return;
            }
            var data = result.data,
                panel = this,
                el = this.getEl();

            if (el.isMasked()) {
                el.unmask();
            }

            if (data.length > 0){
                this.addGraphs(data);
            }else{
                el.mask(_t('No Graph Data') , 'x-mask-msg-noicon');
            }
        },
        addGraphs: function(data) {
            var graphs = [],
                graph,
                graphId,
                me = this,
                start = this.lastShown,
                end = this.lastShown + GRAPHPAGESIZE,
                i;
            // load graphs until we have either completed the page or
            // we ran out of graphs
            for (i=start; i < Math.min(end, data.length); i++) {
                graphId = Ext.id();
                graph = data[i];
                graphs.push(new Zenoss.SwoopyGraph({
                    graphUrl: graph.url,
                    graphTitle: graph.title,
                    graphId: graphId,
                    isLinked: this.isLinked,
                    height: 250,
                    ref: graphId
                }));
            }

            // set up for the next page
            this.lastShown = end;

            // if we have more to show, add a button
            if (data.length > end) {
                graphs.push({
                    xtype: 'button',
                    margin: '0 0 7 7',                    
                    text: _t('Show more results...'),
                    handler: function(t) {
                        t.hide();
                        // will show the next page by looking at this.lastShown
                        me.addGraphs(data);
                    }
                });
            }

            // render the graphs
            this.add(graphs);
        },
        setDrange: function(drange) {
            drange = drange || this.drange;
            this.drange = drange;
            Ext.each(this.getGraphs(), function(g) {
                g.fireEvent("updateimage", {
                    drange: drange,
                    start: drange,
                    end: 0
                }, this);
            });
        },
        resetSwoopies: function() {
            Ext.each(this.getGraphs(), function(g) {
                g.fireEvent("updateimage", {
                }, this);
            });
        },
        getGraphs: function() {
            var graphs = Zenoss.util.filter(this.items.items, function(item){
                return item.graphUrl;
            });
            return graphs;
        },
        setLinked: function(isLinked) {
            this.isLinked = isLinked;
            Ext.each(this.getGraphs(), function(g){
                g.setLinked(isLinked);
            });
        }
    });



}());
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2011, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


(function(){
    var router = Zenoss.remote.TemplateRouter,
        ComponentTemplatePanel;

    function createLocalCopy(grid, templateName) {
        var uid = grid.refOwner.getCurrentUid(),
            params = {
                uid: uid,
                templateName: templateName
            };

        router.makeLocalRRDTemplate(params, function(){
            grid.refresh();
        });
    }

    function deleteLocalCopy(grid, templateName) {
        var uid = grid.refOwner.getCurrentUid(),
            params = {
                uid: uid,
                templateName: templateName
            };
        router.removeLocalRRDTemplate(params, function(){
            grid.refresh();
        });
    }

    function isLocalTemplate(contextUid, templateUid) {
        return templateUid.startswith(contextUid);
    }

    Ext.define("Zenoss.ComponentTemplatePanel", {
        alias:['widget.componenttemplatepanel'],
        extend:"Ext.Panel",
        constructor: function(config) {
            var me = this;
            config = config || {};
            Ext.applyIf(config, {
                layout: 'fit',
                autoScroll: 'y',
                items: [{
                    layout: 'border',
                    defaults: {
                        split: true
                    },
                    items:[{
                        region: 'west',
                        width: '65%',
                        xtype: 'contextgridpanel',
                        ref: '../templates',
                        selModel: Ext.create('Zenoss.SingleRowSelectionModel', {
                            listeners : {
                                select: function (selectionModel, record, rowIndex) {
                                    var thresholds = me.thresholds,
                                        grid = me.templates;
                                    thresholds.setContext(record.get("uid"));
                                    // toggle the delete local and copy local buttons
                                    if (isLocalTemplate(grid.refOwner.getCurrentUid(), record.get("uid"))) {
                                        grid.deleteLocalCopyButton.enable();
                                        grid.createLocalCopyButton.disable();
                                    }else{
                                        grid.createLocalCopyButton.enable();
                                        grid.deleteLocalCopyButton.disable();
                                    }
                                    // enable the threshold add button
                                    thresholds.addButton.enable();
                                },
                                deselect: function(selectionModel) {
                                    var thresholds = me.thresholds,
                                        grid = me.templates;
                                    thresholds.addButton.disable();

                                    // disable both local copy buttons
                                    grid.deleteLocalCopyButton.disable();
                                    grid.createLocalCopyButton.disable();
                                }
                            }
                        }),
                        tbar: [{
                            ref: '../createLocalCopyButton',
                            xtype: 'button',
                            disabled: true,
                            text: _t('Create Local Copy'),
                            handler: function(btn) {
                                var grid = btn.refOwner,
                                    row = grid.getSelectionModel().getSelected();
                                if (row) {
                                    createLocalCopy(grid, row.data.name);
                                }
                            }
                        },{
                            ref: '../deleteLocalCopyButton',
                            xtype: 'button',
                            text: _t('Delete Local Copy'),
                            disabled: true,
                            tooltip: _t('Delete the local copy of this template'),
                            handler: function(btn) {
                                var grid = btn.refOwner,
                                    row = grid.getSelectionModel().getSelected();
                                if (row) {
                                    // show a confirmation
                                 new Zenoss.dialog.SimpleMessageDialog({
                                        title: _t('Delete Copy'),
                                        message: Ext.String.format(_t("Are you sure you want to delete the local copy of this template? There is no undo.")),
                                        buttons: [{
                                            xtype: 'DialogButton',
                                            text: _t('OK'),
                                            handler: function() {
                                                deleteLocalCopy(grid, row.data.name);
                                            }
                                        }, {
                                            xtype: 'DialogButton',
                                            text: _t('Cancel')
                                        }]
                                    }).show();
                                }
                            }
                        }],
                        store: Ext.create('Zenoss.NonPaginatedStore', {
                            directFn: router.getObjTemplates,
                            fields: ['uid', 'name', 'description', 'definition'],
                            root: 'data',
                            listeners: {
                                load: function(store) {
                                    if (store.getCount()) {
                                        me.templates.getSelectionModel().selectRange(0, 0);
                                    }
                                    return true;
                                }
                            }
                        }),
                        viewConfig: {
                            emptyText: _t('No Templates'),
                            stripeRows: true
                        },
                        columns: [{
                            dataIndex: 'name',
                            header: _t('Name'),
                            width: 80,
                            renderer: function(name, idx, record) {
                                var uid = record.data.uid;
                                if (uid){
                                    return Zenoss.render.link(null, uid, name);
                                }
                                return name;
                            }
                        },{
                            dataIndex: 'description',
                            flex: 1,
                            header: _t('Description')
                        },{
                            minWidth: 200,
                            dataIndex: 'definition',
                            header: _t('Definition')
                        }]
                    },{
                        id: 'component_template_threshold',
                        region: 'center',
                        title: null,
                        stateId: 'component_template_thresholds',
                        xtype: 'thresholddatagrid',
                        ref: '../thresholds',
                        getTemplateUid: function() {
                            var templateGrid = this.refOwner.templates,
                                row = templateGrid.getSelectionModel().getSelected();
                            if (row) {
                                return row.data.uid;
                            }
                        },
                        tbarItems:[{
                            xtype: 'tbtext',
                            text: _t('Thresholds')
                        }, '-']
                    }]
                }]

            });
            this.callParent(arguments);
        },
        setContext: function(uid) {
            var templateGrid = this.templates,
                store = templateGrid.getStore();
            templateGrid.setContext(uid);
            this._uid = uid;
            // disable unless until we select a template
            this.thresholds.addButton.disable();
        },
        getCurrentUid: function() {
            return this._uid;
        }
    });

})();
(function(){

    /**
     * @class Zenoss.lockpanel
     * @extends Ext.Panel
     * Panel for locking an object
     **/
    Ext.define('Zenoss.LockPanel', {
        extend: 'Ext.panel.Panel',
        alias: ['widget.lockpanel'],
        constructor: function(config) {
            config = config || {};
            Ext.applyIf(config, {
                listeners:  {
                    show: Ext.bind(this.setCheckboxes, this)
                },
                items: [{
                    xtype: 'panel',
                    frame: false,
                    border: false,
                    layout: 'vbox',
                    height: 110,
                    defaults: {
                        xtype: 'checkbox',
                        flex: 1,
                        align: 'stretch'
                    },
                    items: [{
                        name: 'updates',
                        ref: '../updates',
                        boxLabel: _t('Lock from updates'),
                        listeners: {
                            change: Ext.bind(this.setCheckboxes, this)
                        },
                        checked: config.updatesChecked
                    },{
                        name: 'deletion',
                        ref: '../deletion',
                        boxLabel: _t('Lock from deletion'),
                        listeners: {
                            change: Ext.bind(this.setCheckboxes, this)
                        },
                        checked: config.deletionChecked
                    },{
                        name: 'sendEvent',
                        ref: '../sendEventWhenBlocked',
                        boxLabel: _t('Send an event when an action is blocked'),
                        checked: config.sendEventChecked
                    }]
                }]

            });

            this.callParent([config]);
        },
        /**
          * This dialog consists of three checkboxes.
          * The rules for enabling or disabling the checkboxes:
          *
          * 1. If either updates or deleted is enabled then
          * sendEvents is enabled.
          *
          * 2. If updates is checked then deletion is disabled.
          **/
        setCheckboxes: function() {
            var updatesChecked = this.updates.getValue(),
                    deletionChecked = this.deletion.getValue();
            // rule 1. sendEvents
            if (updatesChecked || deletionChecked) {
                this.sendEventWhenBlocked.enable();
            } else {
                this.sendEventWhenBlocked.setValue(false);
                this.sendEventWhenBlocked.disable();
            }

            // rule 2. updates and deletion
            if (updatesChecked) {
                this.deletion.setValue(true);
                this.deletion.disable();
            } else {
                this.deletion.enable();
            }

        }

    });


    /**
     * @class Zenoss.dialog.LockForm
     * @extends Zenoss.SmartFormDialog
     * Dialog for locking an object.
     **/
    Ext.define('Zenoss.dialog.LockForm',{
        extend: 'Zenoss.SmartFormDialog',
        constructor: function(config) {
            config = config || {};
            Ext.applyIf(config, {
                submitFn: Zenoss.remote.DeviceRouter.lockDevices,
                applyOptions: Ext.emptyFn,
                height: 220,
                title: _t('Locking'),
                submitHandler: Ext.bind(this.lockObject, this),
                items:{
                    xtype: 'lockpanel',
                    updatesChecked: config.updatesChecked,
                    deletionChecked: config.deletionChecked,
                    sendEventChecked: config.sendEventChecked
                }
            });
            this.callParent([config]);
        },

        lockObject: function(values) {
            this.applyOptions(values);
            this.submitFn(values);
        }
    });
}());
/*****************************************************************************
 * 
 * Copyright (C) Zenoss, Inc. 2012, all rights reserved.
 * 
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 * 
 ****************************************************************************/


(function() {
    /**
     * A regular text field that allows a person to provide an example of
     * valid input. This will appear in italics next to the input
     *
     *
     *@class Zenoss.form.ExampleTextField
     *@extends Ext.form.field.Text
     */
    Ext.define("Zenoss.form.ExampleTextField", {
        alias:['widget.exampletextfield'],
        extend:"Ext.form.field.Text",
        /**
         * @cfg {String} example A custom example message to display to the bottom right of the field.
         */
        config: {
            example: null
        },
        fieldSubTpl: [ // note: {id} here is really {inputId}, but {cmpId} is available
            '<input id="{id}" type="{type}" {inputAttrTpl}',
            ' size="1"', // allows inputs to fully respect CSS widths across all browsers
            '<tpl if="name"> name="{name}"</tpl>',
            '<tpl if="value"> value="{[Ext.util.Format.htmlEncode(values.value)]}"</tpl>',
            '<tpl if="placeholder"> placeholder="{placeholder}"</tpl>',
            '<tpl if="maxLength !== undefined"> maxlength="{maxLength}"</tpl>',
            '<tpl if="readOnly"> readonly="readonly"</tpl>',
            '<tpl if="disabled"> disabled="disabled"</tpl>',
            '<tpl if="tabIdx"> tabIndex="{tabIdx}"</tpl>',
            '<tpl if="fieldStyle"> style="{fieldStyle}"</tpl>',
            ' class="{fieldCls} {typeCls} {editableCls}" autocomplete="off"/><span class="example">Example: {example}</span>',
            {
                disableFormats: true
            }
        ],

        constructor: function(config){
            config = config || {};
            config.style = config.style || {};
            // make sure there is enough room for the example
            Ext.applyIf(config.style, {
                paddingBottom: 20
            });
            this.callParent([config]);
        },
        getSubTplData: function() {
            var me = this;

            return Ext.apply(me.callParent(), {
                example   : me.example
            });
        }
    });


}());
/*****************************************************************************
 *
 * Copyright (C) Zenoss, Inc. 2012, all rights reserved.
 *
 * This content is made available according to terms specified in
 * License.zenoss under the directory where your Zenoss product is installed.
 *
 ****************************************************************************/


(function () {

Ext.ns('Zenoss');

var REMOTE = Zenoss.remote.JobsRouter;

function lengthOrZero(o) {
    return o==null ? 0 : o;
}

function isObjectEmpty(o) {
    for (var i in o) {
        if (o.hasOwnProperty(i)) {
             return false;
        }
    }
    return true;
}

function jobLinkRenderer(value, metadata, record) {
    var job = record.data,
    description = job.description;
    description = description.length > 58 ? description.substring(0, 55) + '...' : description;
    // Not htmlEncod()ing the 'description' below, as it's already coming to use encoded
    return "<a href='/zport/dmd/joblist#jobs:" + job.uuid + "'>" + description + "</a>";
}

function readableRenderer(value, metadata, record) {
    var adjective,
        job = record.data,
        date = new Date(0);
    switch (job.status) {
        case "SUCCESS":
            adjective = _t("Finished");
            break;
        case "STARTED":
            adjective = _t("Started");
            break;
        case "PENDING":
            adjective = _t("Scheduled");
            break;
    }
    date.setUTCSeconds(value);
    return adjective + " " + date.readable(1);
}

Ext.define("Zenoss.model.Job", {
    extend: 'Ext.data.Model',
    idProperty: 'uuid',
    fields: [
        'uuid',
        'type',
        'description',
        'scheduled',
        'started',
        'finished',
        'status',
        'result',
        'user'
    ]
});

var runningJobsStore = Ext.create('Ext.data.Store', {
    model: 'Zenoss.model.Job',
    initialSortColumn: 'running'
});

var pendingJobsStore = Ext.create('Ext.data.Store', {
    model: 'Zenoss.model.Job',
    initialSortColumn: 'pending'
});

var finishedJobsStore = Ext.create('Ext.data.Store', {
    model: 'Zenoss.model.Job',
    initialSortColumn: 'finished'
});

Ext.define("Zenoss.JobsWidget", {
    alias: ['widget.jobswidget'],
    extend: "Ext.Button",
    constructor: function(config) {
        config = Ext.applyIf(config || {}, {
            menuAlign: 'br-tr?',
            menu: {
                layout: 'fit',
                plain: true,
                bodyStyle: 'background:transparent;padding:0;border:0',
                style: 'background:transparent;padding:0;border:0',
                items: [{
                    xtype: 'container',
                    width: 425,
                    style: {
                        border: '1px solid #444',
                        '-webkit-border-radius': 5,
                        '-moz-border-radius': 5,
                        '-ms-border-radius': 5,
                        borderRadius: 5
                    },
                    items: [{
                        id: 'nojobspanel',
                        xtype: 'panel',
                        bodyStyle: 'padding:4px',
                        hidden: true,
                        html: _t('No jobs')
                    },{
                        id: 'jobs-grid-running',
                        xtype: 'grid',
                        hideHeaders: true,
                        forceFit: true,
                        stateful: false,
                        disableSelection: true,
                        title: _t('Running jobs'),
                        store: runningJobsStore,
                        columns: [{
                            header: 'description',
                            dataIndex: 'description',
                            renderer: jobLinkRenderer
                        }, {
                            header: 'started',
                            dataIndex: 'started',
                            renderer: readableRenderer,
                            width: 150
                        }]
                    },{
                        id: 'jobs-grid-pending',
                        xtype: 'grid',
                        hideHeaders: true,
                        forceFit: true,
                        stateful: false,
                        disableSelection: true,
                        title: _t('Pending jobs'),
                        store: pendingJobsStore,
                        columns: [{
                            header: 'description',
                            dataIndex: 'description',
                            renderer: jobLinkRenderer
                        }, {
                            header: 'scheduled',
                            dataIndex: 'scheduled',
                            renderer: readableRenderer,
                            width: 150
                        }]
                    },{
                        id: 'jobs-grid-finished',
                        xtype: 'grid',
                        hideHeaders: true,
                        forceFit: true,
                        stateful: false,
                        disableSelection: true,
                        title: _t('Finished jobs'),
                        store: finishedJobsStore,
                        columns: [{
                            header: 'description',
                            dataIndex: 'description',
                            renderer: jobLinkRenderer,
                            width:60,
                            flex: 1
                        }, {
                            header: 'finished',
                            dataIndex: 'finished',
                            renderer: readableRenderer,
                            width: 150
                        }]
                    },{
                        xtype: 'panel',
                        id: 'more-jobs-link',
                        bodyStyle: 'font-size:11px; padding:3px; padding-left: 5px',
                        html: '<a href="/zport/dmd/joblist">More...</a>'
                    }]
                }]
            }
        });
        this.lastchecked = 0;
        this.callParent([config]);
        this.on('beforerender', this.on_render, this, {single:true});
        this.on('menushow', function(e){
            e.menu.hide();
            /*  forcing a recalc of x y when new items are added */
            new Ext.util.DelayedTask(function(){
                e.menu.show();
            }).delay(500);

        }, this, {single:true});
        this.pollTask = new Ext.util.DelayedTask(this.poll, this);
    },
    initComponent: function() {
        this.lastchecked = Ext.util.Cookies.get('jobswidget_update') || 0;
        this.callParent(arguments);
    },
    on_render: function() {
        this.menucontainer = this.menu.items.items[0];
        this.init_tip();
        // initially delay before rending the jobs widget so that
        // other, more important, router requests have time to complete.
        this.pollTask.delay(2000);
    },
    initEvents: function() {
        this.callParent(arguments);
        this.addEvents('update');
        // Listen to Direct requests for job results
        Ext.Direct.on('event', function(e) {
            if (Ext.isDefined(e.result) && e.result && Ext.isDefined(e.result.new_jobs)) {
                Ext.each(e.result.new_jobs, function(job) {
                    this.alert_new(job);
                }, this);
            }
        }, this);
    },
    init_tip: function() {
        var me = this,
            klass = Ext.ClassManager.getByAlias("widget.tooltip"),
            tip = this.tip = Ext.create('Ext.tip.ToolTip', {
                target: this,
                dismissDelay: 9000,
                show: function() {
                    klass.prototype.show.call(this);
                    this.triggerElement = me.el;
                    this.clearTimer('hide');
                    this.targetXY = this.el.getAlignToXY(me.el, 'br-tr', [-15, -18]);
                    klass.prototype.show.call(this);
                }
            });
        tip.mun(this, 'mouseover', tip.onTargetOver, tip);
        tip.mun(this, 'mouseout', tip.onTargetOut, tip);
        tip.mun(this, 'mousemove', tip.onMouseMove, tip);
    },
    alert: function(msg) {
        if (this.tip.isVisible()) {
            msg = this.tip.body.dom.innerHTML + '<br/><br/>' + msg;
        }
        this.tip.update(msg);
        this.tip.show();
    },
    alert_new: function(job) {
        this.alert("<b>New job</b>: " + Ext.htmlEncode(job.description));
    },
    alert_finished: function(job) {
        this.alert("<b>Finished job</b>: " + Ext.htmlEncode(job.description));
    },
    poll: function() {
        this.update();
        this.pollTask.delay(Zenoss.settings.zenjobsRefreshInterval * 1000);
    },
    pause: function() {
        this.pollTask.cancel();
    },
    check_for_recently_finished: function(jobs) {
        if (Ext.isDefined(jobs.SUCCESS)) {
            Ext.each(jobs.SUCCESS, function(job) {
                if (job.finished >= this.lastchecked) {
                    this.alert_finished(job);
                }
            }, this);
        }
        this.set_lastchecked();
    },
    update_button: function(totals) {
        var pending = lengthOrZero(totals.PENDING),
            running = lengthOrZero(totals.STARTED),
            text, cl, jobText;
        if (!pending && !running) {
            text = _t("0 Jobs");
            cl = 'circle_arrows_still';
        } else {
            running > 1 ? jobText = " Jobs" : jobText = " Job";
            text = running + jobText + " ("+pending+" Pending)";
            cl = 'circle_arrows_ani';
        }
        this.setIconCls(cl);
        this.setText(text);
    },
    update_menu: function(jobs) {
        if (!isObjectEmpty(jobs)) {
            Ext.getCmp('nojobspanel').hide();
            Ext.getCmp('jobs-grid-running').setVisible(jobs.STARTED);
            if (jobs.STARTED) {
                runningJobsStore.loadData(jobs.STARTED);
            }
            Ext.getCmp('jobs-grid-pending').setVisible(jobs.PENDING);
            if (jobs.PENDING) {
                pendingJobsStore.loadData(jobs.PENDING);
            }
            Ext.getCmp('jobs-grid-finished').setVisible(jobs.SUCCESS);
            if (jobs.SUCCESS) {
                finishedJobsStore.loadData(jobs.SUCCESS);
            }
            Ext.getCmp('more-jobs-link').show();
        } else {
            Ext.getCmp('nojobspanel').show();
            Ext.getCmp('jobs-grid-running').hide();
            Ext.getCmp('jobs-grid-pending').hide();
            Ext.getCmp('jobs-grid-finished').hide();
            Ext.getCmp('more-jobs-link').hide();
        }
    },
    set_lastchecked: function() {
        // expires two weeks from now
        var cookieExpires = Ext.Date.add(new Date(), Ext.Date.DAY, 14);
        this.lastchecked = (new Date().getTime()/1000);
        Ext.util.Cookies.set('jobswidget_update', this.lastchecked, cookieExpires);
    },
    update: function() {
        REMOTE.userjobs({}, function(result){
            var jobs = result.jobs;
            this.update_button(result.totals);
            this.update_menu(jobs);
            this.check_for_recently_finished(jobs);
        }, this);
    }
});

})(); // End local namespace
(function(){

    /**
     * Classes for determining when the page is completely loaded. Since this
     * is set per page encapsulate the logic here.
     *
     **/
    Ext.define("Zenoss.stats.ResultsWindow", {
        extend: "Zenoss.dialog.BaseDialog",
        constructor: function(config) {
            var finalTime = config.finalTime,
                loadingTime = config.loadingTime;


            Ext.applyIf(config, {
                title: _t('Page Load Time'),
                defaults: {
                    xtype: 'displayfield'
                },
                items: [{
                    value: Ext.String.format(_t("{0} seconds until the page is ready to use."), loadingTime)
                }, {
                    value: Ext.String.format(_t("{0} seconds in layout and rendering on the client."), (finalTime - Zenoss._pageStartTime).toFixed(2))
                }, {
                    value: Ext.String.format(_t("{0} seconds since ExtJs start time."), (finalTime - (Ext._startTime/1000)).toFixed(2))
                },{
                    value: Ext.String.format(_t("{0} seconds spent in Ajax requests."), (config.ajaxTime).toFixed(2))
                }]

            });
            this.callParent([config]);
        }


    });

    Ext.define("Zenoss.stats.Infrastructure", {
        pageName: 'Infrastructure',
        constructor: function() {
            this.addHooks();
        },
        addHooks: function() {
            // the Infrastructure page is loaded when the both the trees
            // and grid stores are loaded and rendered. Since
            // we don't really load the store until after the Devices tree is rendered
            // we can assume the page is fully loaded when the Device grid has finished loading
            // its store.
            Ext.getCmp('device_grid').getStore().on('guaranteedrange', this.checkReady, this, {single:true});
        },
        getTiming: function() {
            var perf = window.performance || {};
            var fn = perf.now || perf.mozNow || perf.webkitNow || perf.msNow || perf.oNow;
            return fn ? fn.bind(perf) : Ext.emptyFn;
        },
        checkReady: function() {

            // convert from milliseconds to seconds
            var finalTime = new Date().getTime() / 1000.0,
                loadingTime = this.getTiming()(),
                ajaxTime = Ext.Array.sum(Ext.pluck(completedRequests, 'time'));
            // perf data is unavailable, display nothing
            if (!loadingTime) {
                return;
            }

            loadingTime = (loadingTime / 1000.00).toFixed(2);
            Zenoss.remote.DetailNavRouter.recordPageLoadTime({
                page: this.pageName,
                time: loadingTime
            });
            // do not listen to ajax requests anymore
            Ext.Ajax.un('beforerequest', beforeAjaxRequest);
            Ext.Ajax.un('requestcomplete', afterAjaxRequest);
            Ext.getCmp('footer_bar').add(['-', {
                xtype: 'button',
                text: Ext.String.format(_t("{0} seconds"), loadingTime),
                handler: function(){
                    Ext.create('Zenoss.stats.ResultsWindow', {
                        finalTime: finalTime,
                        loadingTime: loadingTime,
                        ajaxTime: ajaxTime
                    }).show();
                }
            }]);
        }


    });

    Ext.define("Zenoss.stats.Events", {
        extend: "Zenoss.stats.Infrastructure",
        pageName: 'EventConsole',
        addHooks: function() {
            Ext.getCmp('events_grid').getStore().on('datachanged', this.checkReady, this, {single:true});
        }

    });

    Ext.define("Zenoss.stats.DeviceDetail", {
        extend: "Zenoss.stats.Infrastructure",
        pageName: 'DeviceDetails',
        addHooks: function() {
            var detailnav = Ext.getCmp('deviceDetailNav');
            detailnav.on('componenttreeloaded', this.checkReady, this, {single:true});
        }

    });

    var openRequests = {}, completedRequests=[];

    /**
     * Uniquely identify each ajax request so that
     * we can match it up when the results come back from the server.
     **/
    function getTransactionId(transaction) {
        if (!transaction) {
            return null;
        }

        if (Ext.isArray(transaction)) {
            var ids = Ext.pluck(transaction, "id");
            return ids.join(" ");
        }
        return transaction.id;
    }

    /**
     * Log the start time and Url of each ajax request that has a transaction
     * associated with it.
     **/
    function beforeAjaxRequest(conn, options) {
        var url = options.url, transactionId = getTransactionId(options.transaction);
        if (transactionId) {
            openRequests[transactionId] = {
                url: url,
                starttime: new Date().getTime()
            };
        }
    }

    /**
     * Log the end time so we can get the total time spent in ajax requests.
     **/
    function afterAjaxRequest(conn, response, options) {
        var url = options.url, endtime = new Date().getTime(), transactionId = getTransactionId(options.transaction);
        if (openRequests[transactionId]) {
            completedRequests.push({
                url: url,
                time: (endtime - openRequests[transactionId].starttime) / 1000.00
            });
            delete openRequests[transactionId];
        }
    }

    Ext.onReady(function() {
        if (Zenoss.settings.showPageStatistics) {
            Ext.Ajax.on('beforerequest', beforeAjaxRequest);
            Ext.Ajax.on('requestcomplete', afterAjaxRequest);
        }
    });
}());