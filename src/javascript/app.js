Ext.define("portfolio-predictability-productivity", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'selector_box'},
        {xtype:'container',itemId:'display_box'}
    ],

    integrationHeaders : {
        name : "portfolio-predictability-productivity"
    },

    config: {
        defaultSettings: {
            iterationStartOffsetDays: 2,
            iterationEndOffsetDays: 0
        }
    },
                        
    launch: function() {

        CArABU.technicalservices.Utility.fetchPortfolioItemTypes().then({
            success: this.addPickers,
            failure: this.showErrorNotification,
            scope: this
        });
    },
      
    addPickers: function(portfolioItemTypes){
        this.portfolioItemTypes = portfolioItemTypes;
        this.logger.log('addPortfolioPicker', portfolioItemTypes,portfolioItemTypes.slice(0,2));

        this.getSelectorBox().removeAll();

        this.getSelectorBox().add({
            xtype: 'rallyartifactsearchcombobox',
            width: 500,
            labelWidth: 100,
            fieldLabel: "Cross Project",
            labelAlign: 'right',
            remoteFilter: true,
            storeConfig: {
                pageSize: 200,
                models: portfolioItemTypes.slice(0,2)
            }
        });

        this.getSelectorBox().add({
            xtype: 'container',
            layout: 'hbox',
            margin: '10 0 0 0',
            items: [{
                xtype: 'rallydatefield',
                itemId: 'startDate',
                fieldLabel: 'Date from',
                labelAlign: 'right',
                labelWidth: 100,
                width: 275,
                labelSeparator: ''

            },{
                xtype: 'rallydatefield',
                itemId: 'endDate',
                fieldLabel: 'to',
                labelAlign: 'right',
                labelWidth: 25,
                width: 225,
                labelSeparator: ''
            },{
                xtype: 'rallybutton',
                text: 'Update',
                margin: '0 10 0 10',
                listeners: {
                    click: this.updateView,
                    scope: this
                }
            }]
        });

    },
    getSelectorBox: function(){
        return this.down('#selector_box');
    },
    getDisplayBox: function(){
        return this.down('#display_box');
    },
    getStartDate: function(){
        return this.down('#startDate').getValue();
    },
    getEndDate: function(){
        this.logger.log('getEndDate',this.down('#endDate').getValue());
        if (this.down('#endDate').getValue()){
            //we are adding a day since the datepicker gives us the new day at midnight.
            return Rally.util.DateTime.add(this.down('#endDate').getValue(),'day',1);
        }
        return null;
    },
    getPortfolioItem: function(){
        return this.down('rallyartifactsearchcombobox') && this.down('rallyartifactsearchcombobox').getRecord() || null;
    },
    updateView: function(){

        this.getDisplayBox().removeAll();

        var pi = this.getPortfolioItem(),
            startDate = this.getStartDate(),
            endDate = this.getEndDate();
        this.logger.log('updateView', pi, startDate, endDate);
        if (!pi ||!startDate || !endDate ){
            this.showNoData("Please select a portfolio item and a date range.");
            return;
        }

        this.setLoading(true);
        Deft.Promise.all([
            this.fetchIterations(startDate, endDate),
            this.fetchReleases(startDate,endDate, pi)
        ]).then({
            success: function(iterations){
                this.fetchStorySnapshots(iterations, pi);
            },
            failure: this.showErrorNotification,
            scope: this
        }).always(function(){this.setLoading(false);}, this);
    },
    getFeatureFieldName: function(){
        return this.portfolioItemTypes && this.portfolioItemTypes[0] && this.portfolioItemTypes[0].replace("PortfolioItem/","") || null;
    },
    getPortfolioFilter: function(pi){
        var type = pi.get('_type');
        this.logger.log('fetchStories',type);
        var idx = 0;
        Ext.Array.each(this.portfolioItemTypes, function(t){
            if (t.toLowerCase() === type){
                return false;
            }
            idx++;
        });

        var property = this.getFeatureFieldName();
        if (idx > 0){
            property = property + ".Parent";
        }
        property = property + '.ObjectID';

        return Ext.create('Rally.data.wsapi.Filter',{
            property: property ,
            value: pi.get('ObjectID')
        });
    },
    fetchIterations: function(startDate, endDate){
        return CArABU.technicalservices.Utility.fetchWsapiRecords({
            model: 'Iteration',
            fetch: ['Name','ObjectID','StartDate','EndDate','Project'],
            context: { project: null },
            filters: [{
                property: 'EndDate',
                operator: "<",
                value: Rally.util.DateTime.toIsoString(endDate)
            },{
                property: 'EndDate',
                operator: ">=",
                value: Rally.util.DateTime.toIsoString(startDate)
            }],
            limit: 'Infinity'
        });
    },
    fetchReleases: function(startDate, endDate, pi){

        var piProperty = this.getFeatureFieldName();
        if (pi.get('_type').toLowerCase() === this.portfolioItemTypes[1].toLowerCase()){
            piProperty = piProperty + ".Parent";
        }
        piProperty = piProperty + ".ObjectID";
        this.logger.log('fetchReleases', piProperty, pi.get('_type'),this.portfolioItemTypes[1]);

        return CArABU.technicalservices.Utility.fetchWsapiRecords({
            model: 'Release',
            fetch: ['Name','ReleaseStartDate','ReleaseDate','Project','ObjectID'],
            context: { project: null },
            filters: [{
                property: 'ReleaseDate',
                operator: "<",
                value: Rally.util.DateTime.toIsoString(endDate)
            },{
                property: 'ReleaseDate',
                operator: ">=",
                value: Rally.util.DateTime.toIsoString(startDate)
            }],
            limit: 'Infinity'
        });
    },
    getStartDateOffset: function(){
        return this.getSetting('iterationStartOffsetDays') || 0;
    },
    getEndDateOffset: function(){
        return this.getSetting('iterationEndOffsetDays') || 0;
    },
    getStorySnapshotFetchList: function(){
        return ['ObjectID','Iteration','Release','PlanEstimate','ScheduleState','AcceptedDate','TaskEstimateTotal','TaskRemainingTotal','Project','_ValidFrom','_ValidTo'];
    },
    fetchStorySnapshots: function(iterationsAndReleases, pi){
        this.logger.log('fetchStorySnapshots',iterationsAndReleases, pi);

        this.setLoading(true);
        CArABU.technicalservices.Utility.fetchSnapshots({
                 find: {
                     _TypeHierarchy: 'HierarchicalRequirement',
                     _ItemHierarchy: pi.get('ObjectID'),
                     _ValidTo: {$gte: this.getStartDate()},
                     _ValidFrom: {$lte: this.getEndDate()},
                     "$or": [{Iteration: {$ne: null}},{Release: {$ne: null}}]
                 },
                 fetch: this.getStorySnapshotFetchList(),
                 hydrate: ['Project']
        }).then({
            success: function(snapshots){
                this.processSnapshots(snapshots, iterationsAndReleases, pi);
            },
            failure: this.showErrorNotification,
            scope: this
        }).always(function(){
            this.setLoading(false);
        }, this);
    },
    snapSpansDate: function(snap, targetDate){
        var validFrom = Rally.util.DateTime.fromIsoString(snap._ValidFrom),
            validTo = Rally.util.DateTime.fromIsoString(snap._ValidTo);

        //this.logger.log('snapSpansDate',snap.ObjectID, validFrom, validTo, targetDate,validFrom < targetDate && validTo > targetDate);
        return validFrom < targetDate && validTo > targetDate;
    },
    getSnapsForDateAndTimebox: function(snapshots, timeboxField, timeboxValues, targetDate){
        var filteredSnaps = [];

        if (!Ext.isArray(timeboxValues)){
            timeboxValues = [timeboxValues];
        }
        console.log('getSnapsForData', timeboxField, timeboxValues,snapshots);
        for (var i=0; i<snapshots.length; i++){
            var snap = snapshots[i];
            if (Ext.Array.contains(timeboxValues, snap[timeboxField]) && this.snapSpansDate(snap, targetDate)){
                filteredSnaps.push(snap)
            }
        }
        return filteredSnaps;
    },
    processSnapshots: function(snapshots, iterationsAndReleases, pi){
        this.logger.log('processSnapshots', snapshots, iterationsAndReleases, pi);

        var iterations = iterationsAndReleases[0],
            releaseRecords = iterationsAndReleases[1];


        //Organize Snapshots by project
        var projectHash = {},
            relevantIterationOids = [],
            relevantReleaseOids = [];

        for (var i=0; i<snapshots.length; i++){

            var snap = snapshots[i].getData(),
                projectName = snap.Project.Name;

            if (!projectHash[projectName]){
                projectHash[projectName] = {snaps: []};
            }
            projectHash[projectName].snaps.push(snap);
            if (!Ext.Array.contains(relevantIterationOids, snap.Iteration)){
                relevantIterationOids.push(snap.Iteration);
            }if (!Ext.Array.contains(relevantReleaseOids, snap.Release)){
                relevantReleaseOids.push(snap.Release);
            }
        }

        var iterationHash = {}; //Now we need to filter out only the ones we are interested in
        Ext.Array.each(iterations, function(i){
            if (Ext.Array.contains(relevantIterationOids, i.get('ObjectID'))){
                iterationHash[i.get('ObjectID')] = i.getData();
            }
        });
        var iterations = Ext.Object.getKeys(iterationHash);

        var releaseHash = {},
            releases = [];
        Ext.Array.each(releaseRecords, function(i){
            if (Ext.Array.contains(relevantReleaseOids, i.get('ObjectID'))){
                //releaseHash[i.get('ObjectID')] = i.getData();
                releases.push(i.get('ObjectID'));
            }
        });
        this.logger.log('processSnapshots', releases, relevantReleaseOids, releaseRecords);

        Ext.Array.each(iterations, function(i){

            var iteration = iterationHash[i],
                projectName = iteration && iteration.Project && iteration.Project.Name || "Unknown Iteration " + i;

            if (projectHash[projectName]){
                var snaps = projectHash[projectName].snaps,
                    adjustedStartDate = Rally.util.DateTime.add(iteration.StartDate,'day',this.getStartDateOffset()),
                    adjustedEndDate = Rally.util.DateTime.add(iteration.EndDate,'day',this.getEndDateOffset()),
                    startSnaps = this.getSnapsForDateAndTimebox(snaps, 'Iteration', iteration.ObjectID, adjustedStartDate),
                    endSnaps = this.getSnapsForDateAndTimebox(snaps, 'Iteration', iteration.ObjectID, adjustedEndDate),
                    releaseStartSnaps = this.getSnapsForDateAndTimebox(snaps, 'Release', releases, adjustedStartDate),
                    releaseEndSnaps = this.getSnapsForDateAndTimebox(snaps, 'Release', releases, adjustedEndDate);

                if (!projectHash[projectName]){
                    projectHash[projectName] = {};
                }

                var plannedPoints = 0,
                    acceptedPoints = 0,
                    estimatedTasks = 0,
                    remainingTasks = 0;

                Ext.Array.each(startSnaps, function(s){
                    plannedPoints += s.PlanEstimate || 0;
                    estimatedTasks += s.TaskEstimateTotal || 0;
                });
                Ext.Array.each(endSnaps, function(s){
                    if (s.AcceptedDate){
                        acceptedPoints += s.PlanEstimate || 0;
                    }
                    remainingTasks += s.TaskRemainingTotal || 0;
                });

                var releasePlannedPoints = 0,
                    releaseAcceptedPoints = 0;
                console.log('release', releaseStartSnaps);

                Ext.Array.each(releaseStartSnaps, function(s){
                    releasePlannedPoints += s.PlanEstimate || 0;
                });
                Ext.Array.each(releaseEndSnaps, function(s){
                    if (s.AcceptedDate){
                        releaseAcceptedPoints += s.PlanEstimate || 0;
                    }
                });

                projectHash[projectName][iteration.ObjectID] = {
                    startSnaps: startSnaps,
                    endSnaps: endSnaps,
                    plannedPoints: plannedPoints,
                    acceptedPoints: acceptedPoints,
                    estimatedTasks: estimatedTasks,
                    remainingTasks: remainingTasks,
                    releasePlannedPoints: releasePlannedPoints,
                    releaseAcceptedPoints: releaseAcceptedPoints
                };

            }
        }, this);

       this.logger.log('projectHash', projectHash);

        var data = this.buildCustomTreeData(projectHash, releaseHash, pi, iterationHash);
        this.addTreeGrid(data);

    },
    addGrid: function(data){
        this.getDisplayBox().add({
            xtype: 'rallygrid',
            store: Ext.create('Rally.data.custom.Store',{
                data: data,
                fields: [
                    'isTotal',
                    'project',
                    'planEstimate',
                    'acceptedPlanEstimate',
                    'productivity',
                    'taskPlan',
                    'taskToDo',
                    'predictability',
                    'releasePoints',
                    'releaseAccepted',
                    'releaseProductivity'
                ]
            }),
            margin: '25 0 0 0',
            columnCfgs: this.getColumnCfgs(),
            pageSize: data.length,
            showPagingToolbar: false,
            showRowActionsColumn: false
        });
    },

    buildCustomTreeData: function(projectHash, releases, pi, iterationHash){
        var data = [],
            totalPlanEstimate = 0,
            totalAcceptedPlanEstimate = 0,
            totalTaskPlan = 0,
            totalTaskToDo = 0,
            totalReleaseAccepted = 0,
            totalReleasePoints = 0;

        Ext.Object.each(projectHash, function(projectName, iterationData){

                    var row = {
                            project: projectName,
                        },
                        plan = 0,
                        accepted = 0,
                        taskPlan = 0,
                        taskToDo = 0,
                        releasePlan=0,
                        releaseAccepted = 0,
                        children = [];

                    Ext.Object.each(iterationData, function(iterationId, data){
                        if (iterationId !== 'snaps'){
                            var iterationName = iterationHash[iterationId] && iterationHash[iterationId].Name || "Unkonwn (" + iterationId + ")";
                            var child = {
                                project: iterationName,
                                isTotal: false,
                                releaseAccepted: data.releaseAcceptedPoints,
                                releasePoints: data.releasePlannedPoints,
                                releaseProductivity: 0,
                                planEstimate: data.plannedPoints,
                                acceptedPlanEstimate: data.acceptedPoints,
                                productivity: 0,
                                taskPlan: data.estimatedTasks,
                                taskToDo: data.remainingTasks,
                                predictability: 0,
                                leaf: true
                            };

                            plan += data.plannedPoints;
                            accepted += data.acceptedPoints;
                            taskPlan += data.estimatedTasks;
                            taskToDo += data.remainingTasks;
                            releasePlan += data.releasePlannedPoints;
                            releaseAccepted += data.releaseAcceptedPoints;

                            if (child.planEstimate){
                                child.productivity = child.acceptedPlanEstimate/child.planEstimate;
                            }
                            if (child.taskPlan){
                                child.predictability = (child.taskPlan - child.taskToDo)/child.taskPlan;
                            }
                            if (child.releasePoints){
                                child.releaseProductivity = (child.releaseAccepted/child.releasePoints);
                            }

                            children.push(child);
                        }
                    }, this);


                    row.isTotal = false;
                    row.planEstimate = plan;
                    row.acceptedPlanEstimate = accepted;
                    row.taskPlan = taskPlan;
                    row.taskToDo = taskToDo;
                    row.productivity = plan ? accepted/plan : 0;
                    row.predictability = taskPlan ? (taskPlan - taskToDo)/taskPlan : 0;

                    row.releaseAccepted = releaseAccepted;
                    row.releasePoints = releasePlan;
                    row.releaseProductivity = releasePlan ? releaseAccepted/releasePlan : 0;
                    row.children = children;

                    data.push(row);

                    totalPlanEstimate += plan;
                    totalAcceptedPlanEstimate += accepted;
                    totalTaskPlan += taskPlan;
                    totalTaskToDo += taskToDo;
                    totalReleaseAccepted += releaseAccepted;
                    totalReleasePoints += releasePlan;

        }, this);

        var totalRow = {
            isTotal: true,
            project: pi.get('Name'),
            planEstimate: totalPlanEstimate,
            acceptedPlanEstimate: totalAcceptedPlanEstimate,
            taskPlan: totalTaskPlan,
            taskToDo: totalTaskToDo,
            productivity: totalPlanEstimate ? totalAcceptedPlanEstimate/totalPlanEstimate : 0,
            predictability: totalTaskPlan ? (totalTaskPlan - totalTaskToDo)/totalTaskPlan : 0,
            releaseAccepted: totalReleaseAccepted,
            releasePoints: totalReleasePoints,
            releaseProductivity: totalReleasePoints ? totalReleaseAccepted/totalReleasePoints : 0,
            children: data
        };

        //data.unshift(totalRow);
        this.logger.log('processSnapshots data' ,totalRow);
        return [totalRow];
    },
    addTreeGrid: function(data){

        var store = Ext.create('Ext.data.TreeStore', {
            root: {
                children: data,
                expanded: false
            },
            model: CArABU.technicalservices.TeamTimeboxTreeModel
        });


        this.getDisplayBox().add({
            xtype: 'treepanel',
            itemId: 'summary-grid',
            cls: 'rally-grid',
            padding: 25,

            store: store,
            rootVisible: false,
            columns: this.getTreeColumnCfgs()
        });
    },
    getTreeColumnCfgs: function(){
        return [{
            xtype: 'treecolumn',
            text: 'Team / Timebox',
            menuDisabled: true,
            dataIndex: 'project',
            flex: 1,
            minWidth: 200

        },{
            text: 'Iteration Productivity',
            columns: [{
                dataIndex: 'planEstimate',
                text: 'Plan',
                renderer: this.styleRenderer,
                menuDisabled: true
            },{
                dataIndex: 'acceptedPlanEstimate',
                text: 'Accepted',
                renderer: this.styleRenderer,
                menuDisabled: true
            },{
                dataIndex: 'productivity',
                text: '%',
                renderer: this.percentRenderer,
                menuDisabled: true
            }]
        },{
            text: 'Iteration Predictability',
            columns: [{
                dataIndex: 'taskPlan',
                text: 'Plan',
                renderer: this.styleRenderer,
                menuDisabled: true
            },{
                dataIndex: 'taskToDo',
                text: 'To Do',
                renderer: this.styleRenderer,
                menuDisabled: true
            },{
                dataIndex: 'predictability',
                text: '%',
                renderer: this.percentRenderer,
                menuDisabled: true
            }]
        },{
            text: 'Release Productivity',
            columns: [{
                dataIndex: 'releasePoints',
                text: 'Release Scheduled',
                renderer: this.styleRenderer,
                menuDisabled: true
            },{
                dataIndex: 'releaseAccepted',
                text: 'Release Completed',
                renderer: this.styleRenderer,
                menuDisabled: true
            },{
                dataIndex: 'releaseProductivity',
                text: '%',
                renderer: this.percentRenderer,
                menuDisabled: true
            }]
        }];
    },

    getColumnCfgs: function(){
        return [{
            dataIndex: 'project',
            text: 'Team / Timebox',
            flex: 1,
            renderer: this.styleRenderer
        },{
            text: 'Iteration Productivity',
            columns: [{
                dataIndex: 'planEstimate',
                text: 'Plan',
                renderer: this.styleRenderer,
                menuDisabled: true
            },{
                dataIndex: 'acceptedPlanEstimate',
                text: 'Accepted',
                renderer: this.styleRenderer,
                menuDisabled: true
            },{
                dataIndex: 'productivity',
                text: '%',
                renderer: this.percentRenderer,
                menuDisabled: true
            }]
        },{
            text: 'Iteration Predictability',
            columns: [{
                dataIndex: 'taskPlan',
                text: 'Plan',
                renderer: this.styleRenderer,
                menuDisabled: true
            },{
                dataIndex: 'taskToDo',
                text: 'To Do',
                renderer: this.styleRenderer,
                menuDisabled: true
            },{
                dataIndex: 'predictability',
                text: '%',
                renderer: this.percentRenderer,
                menuDisabled: true
            }]
        },{
            text: 'Release Productivity',
            columns: [{
                dataIndex: 'releasePoints',
                text: 'Release Scheduled',
                renderer: this.styleRenderer,
                menuDisabled: true
            },{
                dataIndex: 'releaseAccepted',
                text: 'Release Completed',
                renderer: this.styleRenderer,
                menuDisabled: true
            },{
                dataIndex: 'releaseProductivity',
                text: '%',
                renderer: this.percentRenderer,
                menuDisabled: true
            }]
        }];
    },
    styleRenderer: function(v,m,r){
        if (r.get('isTotal')){
            m.tdCls = 'total-row'
        }
        return v;
    },
    percentRenderer: function(v,m){
         if (v > .85 && v < 1.15){
             m.tdCls = 'green-threshold';
         } else if ((v > .75) && (v < 1.25)){
             m.tdCls = 'yellow-threshold';
         } else {
             m.tdCls = 'red-threshold';
         }
        console.log('v',v, m.tdCls);

        return Math.round((v || 0) * 100) + "%";
    },
    showErrorNotification: function(msg){
        this.setLoading(false);
        Rally.ui.notify.Notifier.showError({message: msg});
    },
    showNoData: function(msg){

        if (!msg){
            msg = 'No data found for the selected item.';
        }

        this.getDisplayBox().add({
            xtype: 'container',
            html: '<div class="no-data-container"><div class="secondary-message">' + msg + '</div></div>'
        });
    },
    getSettingsFields: function(){

        return [{
            name: 'iterationStartOffsetDays',
            xtype: 'rallynumberfield',
            fieldLabel: 'Offset from Iteration Start (days)',
            labelWidth: 200
        },{
            name: 'iterationEndOffsetDays',
            xtype: 'rallynumberfield',
            fieldLabel: 'Offset from Iteration End (days)',
            labelWidth: 200
        }];
    },
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },
    onSettingsUpdate: function (settings){
        this.logger.log('onSettingsUpdate',settings);
        // Ext.apply(this, settings);
        this.launch();
    }
});
