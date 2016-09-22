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

        this.getSelectorBox().add({
            xtype: 'rallyartifactsearchcombobox',
            width: 500,
            labelWidth: 100,
            fieldLabel: "Cross Project",
            labelAlign: 'right',
            storeConfig: {
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
        });
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
            fetch: ['Name','ObjectID','StartDate','EndDate'],
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
        return CArABU.technicalservices.Utility.fetchWsapiRecords({
            model: 'HierarchicalRequirement',
            fetch: ['Name','ObjectID','PlanEstimate','AcceptedDate','Project','Release'],
            filters: [{
                property: 'Release.ReleaseDate',
                operator: "<",
                value: Rally.util.DateTime.toIsoString(endDate)
            },{
                property: 'Release.ReleaseDate',
                operator: ">=",
                value: Rally.util.DateTime.toIsoString(startDate)
            },{
                property: this.getFeatureFieldName() + ".ObjectID",
                value: pi.get('ObjectID')
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

        CArABU.technicalservices.Utility.fetchSnapshots({
                 find: {
                     _TypeHierarchy: 'HierarchicalRequirement',
                     _ItemHierarchy: pi.get('ObjectID'),
                     _ValidTo: {$gte: this.getStartDate()},
                     _ValidFrom: {$lte: this.getEndDate()},
                     Iteration: {$ne: null}
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
    processSnapshots: function(snapshots, iterationsAndReleases, pi){
        this.logger.log('processSnapshots', snapshots, iterationsAndReleases, pi);

        var iterations = iterationsAndReleases[0],
            releaseStories = iterationsAndReleases[1];

        var iterationHash = {};
        Ext.Array.each(iterations, function(i){
            iterationHash[i.get('ObjectID')] = i.getData();
        });

        var projectHash = {};
        for (var i=0; i<snapshots.length; i++){
            var snap = snapshots[i].getData();

            var iteration = iterationHash[snap.Iteration];

            this.processSnapForTimebox(projectHash, iteration, 'Iteration',snap,'StartDate','EndDate');

            if (iteration){ //We only want to add to our hash if the iteration is relevant
                var projectName = snap.Project.Name,
                    adjustedStartDate = Rally.util.DateTime.add(iteration.StartDate,'day',this.getStartDateOffset()),
                    adjustedEndDate = Rally.util.DateTime.add(iteration.EndDate,'day',this.getEndDateOffset());;
                console.log('in if loop', iteration.Name, projectName, adjustedStartDate, adjustedEndDate);
                if (!projectHash[projectName]){
                    projectHash[projectName] = {};
                }

                if (!projectHash[projectName][snap.Iteration]){
                    projectHash[projectName][snap.Iteration] = {
                        startSnaps: [],
                        endSnaps: []
                    }
                }

                if (this.snapSpansDate(snap, adjustedStartDate)) {
                    projectHash[projectName][snap.Iteration].startSnaps.push(snap);
                }
                if (this.snapSpansDate(snap, adjustedEndDate)){
                    projectHash[projectName][snap.Iteration].endSnaps.push(snap);
                }
            }
        }

       this.logger.log('projectHash', projectHash);

        var data = this.buildCustomData(projectHash, releaseStories, pi);
        this.addGrid(data);

    },
    buildCustomData: function(projectHash, releaseStories, pi){
        var data = [],
            totalPlanEstimate = 0,
            totalAcceptedPlanEstimate = 0,
            totalTaskPlan = 0,
            totalTaskToDo = 0,
            projectReleaseHash = {},
            totalReleaseAccepted = 0,
            totalReleasePoints = 0;


        for (var i=0; i< releaseStories.length; i++){
            var story = releaseStories[i].getData(),
                project = story.Project && story.Project.Name,
                release = story.Release && story.Release.ObjectID;

            if (project && release){
                if (!projectReleaseHash[project]){
                    projectReleaseHash[project] = {};
                }
                if (!projectReleaseHash[project][release]){
                    projectReleaseHash[project][release] = [];
                }
                projectReleaseHash[project][release].push(story);
            } else {
                this.logger.log('buildCustomData no Release or Project', story);
            }



        }

        Ext.Object.each(projectHash, function(projectName, iterations){

            var row = {
                    project: projectName
                },
                plan = 0,
                accepted = 0,
                taskPlan = 0,
                taskToDo = 0;

            Ext.Object.each(iterations, function(iterationId, snaps){
                Ext.Array.each(snaps.startSnaps, function(s){
                    plan += s.PlanEstimate || 0;
                    taskPlan += s.TaskEstimateTotal || 0;
                });

                Ext.Array.each(snaps.endSnaps, function(s){
                    if (s.AcceptedDate){
                        accepted += s.PlanEstimate || 0;
                    }
                    taskToDo += s.TaskRemainingTotal || 0;
                });
            });

            var releases = projectReleaseHash[projectName];
            var releaseAccepted = 0,
                releasePoints = 0;
            Ext.Object.each(releases, function(releaseId, stories){

                Ext.Array.each(stories, function(s){
                    if (s.AcceptedDate){
                        releaseAccepted += s.PlanEstimate;
                    }
                    releasePoints += s.PlanEstimate;
                });
            });


            row.isTotal = false;
            row.planEstimate = plan;
            row.acceptedPlanEstimate = accepted;
            row.taskPlan = taskPlan;
            row.taskToDo = taskToDo;
            row.productivity = plan ? accepted/plan : 0;
            row.predictability = taskPlan ? (taskPlan - taskToDo)/taskPlan : 0;

            row.releaseAccepted = releaseAccepted;
            row.releasePoints = releasePoints;
            row.releaseProductivity = releasePoints ? releaseAccepted/releasePoints : 0;

            data.push(row);


            totalPlanEstimate += plan;
            totalAcceptedPlanEstimate += accepted;
            totalTaskPlan += taskPlan;
            totalTaskToDo += taskToDo;
            totalReleaseAccepted += releaseAccepted;
            totalReleasePoints += releasePoints;
        });
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
            releaseProductivity: totalReleasePoints ? totalReleaseAccepted/totalReleasePoints : 0
        };
        data.unshift(totalRow);
        this.logger.log('processSnapshots data' ,data);
        return data;
    },
    processSnapForTimebox: function(projectHash, timebox, timeboxField, snap, startDateField, endDateField){
        if (timebox){ //We only want to add to our hash if the iteration is relevant
            var projectName = snap.Project.Name,
                adjustedStartDate = Rally.util.DateTime.add(timebox[startDateField],'day',this.getStartDateOffset()),
                adjustedEndDate = Rally.util.DateTime.add(timebox[endDateField],'day',this.getEndDateOffset());;
           // console.log('in if loop', timebox.Name, projectName, adjustedStartDate, adjustedEndDate);
            if (!projectHash[projectName]){
                projectHash[projectName] = {};
            }

            if (!projectHash[projectName][snap[timeboxField]]){
                projectHash[projectName][snap[timeboxField]] = {
                    startSnaps: [],
                    endSnaps: []
                }
            }

            if (this.snapSpansDate(snap, adjustedStartDate)) {
                projectHash[projectName][snap[timeboxField]].startSnaps.push(snap);
            }
            if (this.snapSpansDate(snap, adjustedEndDate)){
                projectHash[projectName][snap[timeboxField]].endSnaps.push(snap);
            }
        }
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
    getColumnCfgs: function(){
        return [{
            dataIndex: 'project',
            text: 'Team',
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
    
    //onSettingsUpdate:  Override
    onSettingsUpdate: function (settings){
        this.logger.log('onSettingsUpdate',settings);
        // Ext.apply(this, settings);
        this.launch();
    }
});
