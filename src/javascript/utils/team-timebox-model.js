Ext.define('CArABU.technicalservices.TeamTimeboxTreeModel',{
    extend: "Ext.data.TreeModel",

    fields: [{
        name: 'project',
    }, {
        name: 'timeboxStart'
    },{
        name: 'timeboxEnd'
    },{
        name: "planEstimate",
    },{
        name: "acceptedPlanEstimate"
    },{
        name: "productivity"
    },{
        name: "taskPlan"
    },{
        name: "taskToDo"
    },{
        name: "predictability"
    },{
        name: 'releasePoints'
    },{
        name: 'releaseAccepted'
    },{
        name: 'releaseProductivity'
    }]
});