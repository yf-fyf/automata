var _ = require('lodash');
var React = require('react');
var Router = require('react-router');
var DefaultRoute = Router.DefaultRoute;
var Link = Router.Link;
var Route = Router.Route;
var RouteHandler = Router.RouteHandler;
var $ = require('jquery');
require('jquery.cookie');
var api = require('../api');
var ui = require('../ui2');

var DetailList = require('./detail_list.js');
var SummaryList = require('./summary_list.js');
var UserRoute = require('./user.js');

var Record = React.createClass({
    mixins: [
        Router.Navigation,
        Router.State
    ],

    toggleFilter: function() {
        $.cookie('default-filtered', !this.state.filtered);
        this.setState({
            filtered: !this.state.filtered
        });
    },

    updateStatus: function(token, report, status) {
        this.setState({
            users: this.state.users.map(function(user) {
                if (user.token === token) {
                    user.report[report].status = status;
                }
                return user;
            })
        });
    },

    lastUpdate: 0,
    offsetTime: 0,

    queryComments: function(tokens) {
        api.get({
            api: 'comment',
            data: {
                action: 'list_news',
                user: tokens
            }
        }).done(function(result) {
            var isUpdated = _.some(result, function(comments, report_id) {
                return _.some(comments, function(c, user_token) {
                    var now = [report_id, user_token].reduce(function(r, k) {
                        if (!_.has(r, k)) r[k] = {};
                        return r[k];
                    }, this.state.comments);
                    var f = now.unreads !== c.unreads
                        || now.comments !== c.comments;
                    return f;
                }, this);
            }, this);
            if (this.isMounted() && isUpdated) {
                this.setState({
                    comments: _.assign(this.state.comments, result)
                });
            }
        }.bind(this));
    },

    queryUsers: function() {
        var lastUpdate = this.lastUpdate;
        if (this.prevReturned) this.lastUpdate = new Date().getTime();
        this.prevReturned = false;
        api.get({
            api: 'user',
            data: {
                type: 'status',
                status: 'record',
                log: true,
                assigned: true,
                last: lastUpdate - this.offsetTime
            }
        }).done(function(users) {
            this.prevReturned = true;
            if (users.length > 0) {
                var users = this.state.users.map(function(user) {
                    var update = _.find(users, 'token', user.token);
                    return typeof update !== 'undefined' ? update : user;
                });
                if (this.isMounted()) {
                    this.setState({
                        users: users
                    });
                }
            }

            if (this.state.users.length === 0) return;
            this.queryComments(this.state.users.map(function(user) {
                return user.token;
            }));
        }.bind(this));
    },

    componentDidMount: function() {
        this.lastUpdate = new Date().getTime();
        api.get(
            {
                api: 'master',
                data: {
                    user: true,
                    admin: true,
                    token: true,
                    reload: true,
                    time: true
                }
            },
            {
                api: 'scheme',
                data: { record: true }
            },
            {
                api: 'user',
                data: {
                    type: 'status',
                    status: 'record',
                    log: true,
                    assigned: true
                }
            }
        ).done(function(master, scheme, users) {
            this.offsetTime = new Date().getTime() - master.time;
            this.prevReturned = true;
            var filtered = $.cookie('default-filtered');
            if (typeof filtered === 'undefined' || filtered === 'true') {
                filtered = true;
            } else {
                filtered = false;
            }
            $.cookie('default-filtered', filtered);
            if (this.isMounted()) {
                this.setState({
                    user: master.user,
                    token: master.token,
                    admin: master.admin,
                    scheme: scheme,
                    users: users,
                    comments: {},
                    filtered: filtered
                });
            }
            if (!master.admin && this.getPath() === '/') {
                var report = $.cookie('default-report');
                if (!report) report = scheme[0].id;
                this.replaceWith('user', {
                    token: master.token,
                    report: report
                });
            }
            this.queryComments(users.map(function(user) {
                return user.token;
            }));
            if (master.reload > 0) {
                setInterval(this.queryUsers, master.reload);
            }
        }.bind(this));
    },

    render: function() {
        if (!this.state) return (<img src="../image/loading.gif"/>);

        var filter;
        if (this.state.admin) {
            if (this.state.filtered) {
                filter = (
                        <li>
                        <label>
                        <input type="checkbox" onChange={this.toggleFilter} checked/>
                        担当学生のみ
                        </label>
                        </li>
                );
            } else {
                filter = (
                        <li>
                        <label>
                        <input type="checkbox" onChange={this.toggleFilter}/>
                        担当学生のみ
                        </label>
                        </li>
                );
            }
        }

        var users = _.filter(this.state.users, function(user) {
            return !this.state.admin
                || !this.state.filtered
                || user.token === this.state.token
                || user.assigned === this.state.user;
        }.bind(this));

        Object.keys(this.state.comments).map(function(report_id) {
            var comments = this.state.comments[report_id];
            Object.keys(comments).map(function(key) {
                var user = _.find(users, function(user) {
                    return user.token === key;
                });
                if (typeof user === 'undefined') return;
                ['report', report_id, 'comment'].reduce(function(r, k) {
                    if (typeof r[k] === 'undefined') r[k] = {};
                    return r[k]
                }, user);
                user.report[report_id].comment = comments[key];
            });
        }, this);

        return (<div>
                <div id="view_switch">
                表示:<ul>
                {filter}
                <li><Link to="detail" id="sw_view_report">課題ごと</Link></li>
                <li><Link to="summary" id="sw_view_summary">一覧</Link></li>
                </ul>
                </div>
                <RouteHandler admin={this.state.admin}
                              scheme={this.state.scheme}
                              users={users}
                              updateStatus={this.updateStatus}/>
                </div>
        );
    }
});

var routes = (
        <Route name="record" path="/" handler={Record}>
        <Route name="detail" path="detail" handler={DetailList}/>
        <Route name="summary" path="summary" handler={SummaryList}/>
        {UserRoute}
        <DefaultRoute handler={SummaryList}/>
        </Route>
);

Router.run(routes, function(Handler) {
    React.render(<Handler/>, document.getElementById('record'));
});

$(document).ready(function() {
    api.get({ api: 'template', data: { type: 'record', links: true } }).
        done(function(template) {
            ui.setTitle(template);
            ui.addLinks(template.links);
        });
});
